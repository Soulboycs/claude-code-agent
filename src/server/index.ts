import { ServerWebSocket } from 'bun'
import { sessionDb } from './services/db'
import { ClientMessage, ServerMessage } from './ws/events'
import { query, QueryTerminal } from '../agent/core/query'
import { ToolOrchestrator } from '../agent/core/ToolOrchestrator'
import { createDefaultAgentEngine } from '../main/agent/index'
import { MockLLMProvider, OpenAICompatibleProvider } from '../main/agent/providers/LLMProvider'
import { ProviderConfig } from '../shared/types'
import path from 'path'
import os from 'os'
import fs from 'fs'

export interface WebSocketData {
  sessionId: string
  channel: 'client' | 'sdk'
  connectedAt: number
}

// Active session controllers
interface ActiveSession {
  abortController?: AbortController
  pendingApprovals: Map<string, (approved: boolean) => void>
}

const activeSessions = new Map<string, ActiveSession>()
const connectedClients = new Map<string, Set<ServerWebSocket<WebSocketData>>>()

// Local provider config
const configPath = path.join(os.homedir(), '.claude-agent', 'config.json')

function loadProviderConfig(): ProviderConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.2,
    }
  }
}

function saveProviderConfig(cfg: ProviderConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
}

export function broadcastToSession(sessionId: string, message: ServerMessage) {
  const clients = connectedClients.get(sessionId)
  if (!clients) return
  const payload = JSON.stringify(message)
  for (const ws of clients) {
    try {
      ws.send(payload)
    } catch {}
  }
}

export function startServer(port = 3456, host = process.env.SERVER_HOST || '0.0.0.0') {
  return Bun.serve<WebSocketData>({
    port,
    hostname: host,
    idleTimeout: 0, // Disable idle timeout for stable Windows socket pools

    async fetch(req, server) {
      const url = new URL(req.url)

      // 1. Health Probe
      if (url.pathname === '/health') {
        return Response.json({
          status: 'ok',
          runtime: 'bun',
          version: Bun.version,
          timestamp: new Date().toISOString(),
        })
      }

      // 2. CORS Preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }

      // 3. WebSocket Upgrade (/ws/:sessionId)
      if (url.pathname.startsWith('/ws/')) {
        const sessionId = url.pathname.slice(4)
        if (!sessionId) {
          return new Response('Missing sessionId', { status: 400 })
        }

        const upgraded = server.upgrade(req, {
          data: {
            sessionId,
            channel: 'client',
            connectedAt: Date.now(),
          },
        })

        if (upgraded) return undefined
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // 4. REST API: Sessions
      if (url.pathname === '/api/sessions' && req.method === 'GET') {
        return Response.json(sessionDb.list(), { headers: corsHeaders })
      }

      if (url.pathname === '/api/sessions' && req.method === 'POST') {
        const body = (await req.json()) as any
        const id = body.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const workDir = body.workDir || process.cwd()
        const title = body.title || 'New Session'
        const session = sessionDb.create(id, workDir, title)
        return Response.json(session, { status: 201, headers: corsHeaders })
      }

      if (url.pathname.startsWith('/api/sessions/') && req.method === 'DELETE') {
        const id = url.pathname.slice('/api/sessions/'.length)
        sessionDb.delete(id)
        return Response.json({ success: true }, { headers: corsHeaders })
      }

      // 5. REST API: Config
      if (url.pathname === '/api/config' && req.method === 'GET') {
        return Response.json(loadProviderConfig(), { headers: corsHeaders })
      }

      if (url.pathname === '/api/config' && req.method === 'POST') {
        const body = (await req.json()) as ProviderConfig
        saveProviderConfig(body)
        return Response.json({ success: true }, { headers: corsHeaders })
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders })
    },

    websocket: {
      open(ws) {
        const { sessionId } = ws.data
        if (!connectedClients.has(sessionId)) {
          connectedClients.set(sessionId, new Set())
        }
        connectedClients.get(sessionId)!.add(ws)

        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, { pendingApprovals: new Map() })
        }

        // Initial handshake
        ws.send(JSON.stringify({ type: 'connected', sessionId }))
        ws.send(JSON.stringify({ type: 'session_state', turnState: 'idle' }))
      },

      async message(ws, message) {
        const { sessionId } = ws.data
        let clientMsg: ClientMessage
        try {
          clientMsg = JSON.parse(String(message))
        } catch {
          return
        }

        const sessionState = activeSessions.get(sessionId) || { pendingApprovals: new Map() }
        activeSessions.set(sessionId, sessionState)

        if (clientMsg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }

        if (clientMsg.type === 'permission_response') {
          const resolver = sessionState.pendingApprovals.get(clientMsg.requestId)
          if (resolver) {
            resolver(clientMsg.allowed)
            sessionState.pendingApprovals.delete(clientMsg.requestId)
          }
          broadcastToSession(sessionId, {
            type: 'permission_resolved',
            requestId: clientMsg.requestId,
            allowed: clientMsg.allowed,
          })
          return
        }

        if (clientMsg.type === 'stop_generation') {
          sessionState.abortController?.abort()
          sessionState.abortController = undefined
          broadcastToSession(sessionId, {
            type: 'status',
            state: 'idle',
            message: 'Generation stopped by user.',
          })
          return
        }

        if (clientMsg.type === 'user_message') {
          const session = sessionDb.get(sessionId)
          const workDir = session?.workDir || process.cwd()

          sessionState.abortController = new AbortController()
          const signal = sessionState.abortController.signal

          broadcastToSession(sessionId, { type: 'session_state', turnState: 'running' })
          broadcastToSession(sessionId, { type: 'status', state: 'thinking' })

          const engine = createDefaultAgentEngine({ workspaceRoot: workDir })
          const orchestrator = new ToolOrchestrator(engine.getToolRegistry())
          const cfg = loadProviderConfig()
          const provider = cfg.apiKey ? new OpenAICompatibleProvider(cfg) : new MockLLMProvider()

          // Execute query state machine
          const q = query({
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert autonomous AI Coding Agent. Inspect files and run commands to complete tasks.',
              },
              { role: 'user', content: clientMsg.content },
            ],
            toolRegistry: engine.getToolRegistry(),
            orchestrator,
            provider,
            workspaceRoot: workDir,
            signal,
            onApprovalRequired: (req) => {
              return new Promise<boolean>((resolve) => {
                sessionState.pendingApprovals.set(req.id, resolve)
                broadcastToSession(sessionId, {
                  type: 'permission_request',
                  requestId: req.id,
                  toolName: req.toolName,
                  toolUseId: req.toolCallId,
                  input: req.arguments,
                  description: req.promptMessage,
                })
              })
            },
          })

          try {
            for await (const event of q) {
              if (event.type === 'thinking_delta') {
                broadcastToSession(sessionId, { type: 'thinking', text: event.delta })
              } else if (event.type === 'message_delta') {
                broadcastToSession(sessionId, { type: 'content_delta', text: event.delta })
              } else if (event.type === 'tool_call_start') {
                broadcastToSession(sessionId, {
                  type: 'content_start',
                  blockType: 'tool_use',
                  toolName: event.toolCall.name,
                  toolUseId: event.toolCall.id,
                })
                broadcastToSession(sessionId, {
                  type: 'tool_use_complete',
                  toolName: event.toolCall.name,
                  toolUseId: event.toolCall.id,
                  input: event.toolCall.arguments,
                })
              } else if (event.type === 'tool_call_complete') {
                broadcastToSession(sessionId, {
                  type: 'tool_result',
                  toolUseId: event.result.toolCallId,
                  content: event.result.output || event.result.error,
                  isError: event.result.isError,
                })
              } else if (event.type === 'status_change') {
                broadcastToSession(sessionId, {
                  type: 'status',
                  state: event.status as any,
                  message: event.message,
                })
              }
            }

            broadcastToSession(sessionId, { type: 'message_complete' })
            broadcastToSession(sessionId, { type: 'session_state', turnState: 'idle' })
          } catch (err: any) {
            broadcastToSession(sessionId, {
              type: 'error',
              message: String(err?.message || err),
            })
            broadcastToSession(sessionId, { type: 'session_state', turnState: 'idle' })
          } finally {
            sessionState.abortController = undefined
          }
        }
      },

      close(ws) {
        const { sessionId } = ws.data
        const clients = connectedClients.get(sessionId)
        if (clients) {
          clients.delete(ws)
          if (clients.size === 0) {
            connectedClients.delete(sessionId)
          }
        }
      },
    },
  })
}

// Standalone execution
if (import.meta.main) {
  const port = parseInt(process.env.SERVER_PORT || '3456', 10)
  const host = process.env.SERVER_HOST || '0.0.0.0'
  const server = startServer(port, host)
  console.log(`[Bun.serve] Claude Code Agent server listening on http://${host}:${port}`)
}
