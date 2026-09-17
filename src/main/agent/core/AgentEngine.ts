import { EventEmitter } from 'events'
import {
  AgentEvent,
  AgentStatus,
  ApprovalRequest,
  ChatMessage,
  ProviderConfig
} from '@shared/types'
import { ToolRegistry } from '../tools/ToolRegistry'
import {
  ILLMProvider,
  LLMMessage,
  MockLLMProvider
} from '../providers/LLMProvider'
import { createProvider } from '../providers/ProviderFactory'

export interface AgentEngineOptions {
  workspaceRoot: string
  providerConfig?: ProviderConfig
  customProvider?: ILLMProvider
  maxSteps?: number
}

export class AgentEngine extends EventEmitter {
  private workspaceRoot: string
  private toolRegistry: ToolRegistry
  private provider: ILLMProvider
  private status: AgentStatus = 'idle'
  private maxSteps: number
  private currentAbortController?: AbortController

  // Pending approval resolver
  private pendingApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void; rejectReason?: string }
  >()

  private conversationHistory: LLMMessage[] = []

  constructor(options: AgentEngineOptions) {
    super()
    this.workspaceRoot = options.workspaceRoot
    this.maxSteps = options.maxSteps ?? 25
    this.toolRegistry = new ToolRegistry()

    if (options.customProvider) {
      this.provider = options.customProvider
    } else if (options.providerConfig) {
      this.provider = createProvider(options.providerConfig)
    } else {
      this.provider = new MockLLMProvider()
    }

    this.initSystemPrompt()
  }

  private initSystemPrompt() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an expert autonomous AI Software Engineer and Pair Programmer running inside an Electron desktop app.
Your mission is to understand user requirements, inspect code, run terminal commands, write and edit files, and verify all changes with tests.

Guidelines:
1. Always view files before modifying them to understand their context and structure.
2. For small to medium edits in existing files, prefer "replace_file_content" over "write_to_file" to preserve undamaged code.
3. Verify your work using "run_command" (e.g. running test suites, builds, or linting).
4. Be concise and direct. Explain what you did and show the results clearly.`
      }
    ]
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry
  }

  getStatus(): AgentStatus {
    return this.status
  }

  private setStatus(status: AgentStatus, message?: string) {
    this.status = status
    this.emitEvent({ type: 'status_change', status, message })
  }

  private emitEvent(event: AgentEvent) {
    this.emit('event', event)
  }

  setProvider(provider: ILLMProvider) {
    this.provider = provider
  }

  setWorkspaceRoot(root: string) {
    this.workspaceRoot = root
  }

  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = undefined
    }
    // Reject any pending approvals
    for (const [id, item] of this.pendingApprovals.entries()) {
      item.resolve(false)
      this.pendingApprovals.delete(id)
    }
    this.setStatus('idle', 'Agent execution was aborted.')
  }

  respondApproval(requestId: string, approved: boolean, reason?: string) {
    const pending = this.pendingApprovals.get(requestId)
    if (pending) {
      pending.rejectReason = reason
      pending.resolve(approved)
      this.pendingApprovals.delete(requestId)
    }
  }

  async run(userPrompt: string): Promise<void> {
    if (this.status !== 'idle' && this.status !== 'completed' && this.status !== 'error') {
      throw new Error(`Agent is already busy with status: ${this.status}`)
    }

    this.currentAbortController = new AbortController()
    const signal = this.currentAbortController.signal

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt
    })

    if (this.conversationHistory.length > 40) {
      const systemMsg = this.conversationHistory[0]
      const last20 = this.conversationHistory.slice(-20)
      this.conversationHistory = [
        systemMsg,
        { role: 'user', content: '[上下文已压缩，保留最近对话]' },
        ...last20
      ]
    }

    let step = 0

    try {
      while (step < this.maxSteps) {
        if (signal.aborted) break
        step++

        this.setStatus('thinking', `Step ${step}/${this.maxSteps}: Analyzing and planning...`)

        const streamResult = await this.provider.chatStream(
          this.conversationHistory,
          this.toolRegistry.getAllTools(),
          (chunk) => {
            if (chunk.statusUpdate) {
              this.setStatus('thinking', chunk.statusUpdate)
            }
            if (chunk.thinking) {
              this.emitEvent({ type: 'thinking_delta', delta: chunk.thinking })
            }
            if (chunk.content) {
              this.emitEvent({ type: 'message_delta', delta: chunk.content })
            }
          },
          signal
        )

        // Add assistant message to history
        const assistantMsg: LLMMessage = {
          role: 'assistant',
          content: streamResult.fullContent || undefined
        }

        if (streamResult.toolCalls.length > 0) {
          assistantMsg.tool_calls = streamResult.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        }

        this.conversationHistory.push(assistantMsg)

        // If no tools were called, the agent has finished its task
        if (streamResult.toolCalls.length === 0) {
          this.setStatus('completed', 'Task finished successfully.')
          return
        }

        // Execute tool calls sequentially
        for (const tc of streamResult.toolCalls) {
          if (signal.aborted) break

          const tool = this.toolRegistry.getTool(tc.name)
          const requiresApproval = tool?.requiresApproval ? tool.requiresApproval(tc.arguments) : false

          this.emitEvent({
            type: 'tool_call_start',
            toolCall: {
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              requiresApproval,
              description: tool?.description
            }
          })

          // Human-in-the-Loop check
          if (requiresApproval) {
            this.setStatus('awaiting_confirmation', `Awaiting user approval for ${tc.name}...`)
            const approved = await this.waitForApproval(tc.id, tc.name, tc.arguments)

            if (!approved) {
              const rejectionMsg = 'User rejected this tool execution.'
              this.conversationHistory.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ isError: true, error: rejectionMsg })
              })
              this.emitEvent({
                type: 'tool_call_complete',
                result: {
                  toolCallId: tc.id,
                  name: tc.name,
                  error: rejectionMsg,
                  isError: true
                }
              })
              continue
            }
          }

          this.setStatus('tool_executing', `Executing ${tc.name}...`)

          const toolResult = await this.toolRegistry.executeTool(tc.name, tc.arguments, {
            workspaceRoot: this.workspaceRoot,
            emitTerminalOutput: (chunk) => {
              this.emitEvent({ type: 'terminal_output', chunk })
            },
            signal
          })

          toolResult.toolCallId = tc.id

          this.emitEvent({
            type: 'tool_call_complete',
            result: toolResult
          })

          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult.isError ? (toolResult.error || 'Unknown error') : (toolResult.output || 'Success')
          })
        }
      }

      if (step >= this.maxSteps) {
        this.setStatus('error', `Agent reached maximum step limit (${this.maxSteps}). Halting.`)
      }
    } catch (err: any) {
      if (signal.aborted) {
        this.setStatus('idle', 'Execution cancelled.')
      } else {
        this.setStatus('error', err?.message || String(err))
        this.emitEvent({ type: 'error', message: err?.message || String(err) })
      }
    } finally {
      this.currentAbortController = undefined
    }
  }

  private waitForApproval(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      const approvalRequest: ApprovalRequest = {
        id: requestId,
        toolCallId,
        toolName,
        arguments: args,
        promptMessage: `Tool "${toolName}" requires your authorization to run.`,
        timestamp: Date.now()
      }

      this.pendingApprovals.set(requestId, { resolve })
      this.emitEvent({ type: 'approval_required', request: approvalRequest })
    })
  }
}
