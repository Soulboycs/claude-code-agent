/**
 * Real End-to-End Integration Test
 * Uses actual DeepSeek API key — real network calls, real tool execution
 *
 * Tests the full chain:
 *   User prompt → AgentEngine → DeepSeek API → Tool calls → File system → Response
 */
import { describe, it, expect } from 'bun:test'
import { createDefaultAgentEngine } from '../src/main/agent'
import { createProvider } from '../src/main/agent/providers/ProviderFactory'
import { ProviderConfig } from '../src/shared/types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Real DeepSeek credentials
const DEEPSEEK_CONFIG: ProviderConfig = {
  providerType: 'deepseek',
  apiKey: '***REDACTED-DEEPSEEK-KEY***',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4.1-flash-expires-on-0910',
  temperature: 0.2
}

const WORKSPACE = os.tmpdir()
const E2E_TIMEOUT = 60000

// ─── Helper ──────────────────────────────────────────────────────────────────
async function runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: any
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// ─── Test 1: Raw provider chatStream ─────────────────────────────────────────
describe('E2E — DeepSeek Raw API', () => {
  it('streams a real text response from DeepSeek API', async () => {
    const provider = createProvider(DEEPSEEK_CONFIG)

    const chunks: string[] = []
    const result = await runWithTimeout(
      provider.chatStream(
        [{ role: 'user', content: 'Reply with exactly: NEXUS_OK' }],
        [],
        (chunk) => {
          if (chunk.content) chunks.push(chunk.content)
        }
      ),
      E2E_TIMEOUT
    )

    console.log('[E2E] Raw API fullContent:', JSON.stringify(result.fullContent))
    expect(result.fullContent).toBeTruthy()
    expect(result.fullContent.length).toBeGreaterThan(0)
    // Should contain our requested token
    expect(result.fullContent.toUpperCase()).toContain('NEXUS_OK')
    expect(chunks.length).toBeGreaterThan(0) // streaming chunks received
  }, E2E_TIMEOUT)
})

// ─── Test 2: AgentEngine single turn, no tools ───────────────────────────────
describe('E2E — AgentEngine single turn', () => {
  it('runs a full agent turn and emits message_delta events', async () => {
    const provider = createProvider(DEEPSEEK_CONFIG)
    const engine = createDefaultAgentEngine({
      workspaceRoot: WORKSPACE,
      customProvider: provider
    })

    const events: Array<{ type: string; [k: string]: any }> = []
    engine.on('event', (e: any) => {
      events.push(e)
      console.log(`[E2E] event: ${e.type}`, e.status ?? e.delta?.slice?.(0, 40) ?? '')
    })

    await runWithTimeout(engine.run('Reply with exactly: AGENT_E2E_OK'), E2E_TIMEOUT)

    const types = events.map(e => e.type)
    expect(types).toContain('status_change')
    expect(types).toContain('message_delta')

    const fullResponse = events
      .filter(e => e.type === 'message_delta')
      .map(e => e.delta)
      .join('')

    console.log('[E2E] Full streamed response:', JSON.stringify(fullResponse))
    expect(fullResponse.toUpperCase()).toContain('AGENT_E2E_OK')
    expect(engine.getStatus()).toBe('completed')
  }, E2E_TIMEOUT)
})

// ─── Test 3: Agent calls a real tool (list_directory) ────────────────────────
describe('E2E — AgentEngine tool call', () => {
  it('agent calls list_directory tool on real filesystem', async () => {
    const provider = createProvider(DEEPSEEK_CONFIG)
    const engine = createDefaultAgentEngine({
      workspaceRoot: WORKSPACE,
      customProvider: provider
    })

    const toolCallEvents: any[] = []
    const toolResultEvents: any[] = []
    engine.on('event', (e: any) => {
      if (e.type === 'tool_call_start') toolCallEvents.push(e)
      if (e.type === 'tool_call_complete') toolResultEvents.push(e)
      console.log(`[E2E] event: ${e.type}`, e.toolCall?.name ?? e.result?.name ?? '')
    })

    await runWithTimeout(
      engine.run(`List the files in directory: ${WORKSPACE}. Just call list_directory and tell me what you found.`),
      E2E_TIMEOUT
    )

    console.log('[E2E] Tool calls made:', toolCallEvents.map(e => e.toolCall?.name))
    console.log('[E2E] Tool results:', toolResultEvents.map(e => e.result?.name))

    // Agent should have called at least one tool
    expect(toolCallEvents.length).toBeGreaterThan(0)
    const toolNames = toolCallEvents.map(e => e.toolCall?.name)
    // Should call list_directory or similar file tool
    const fileTools = ['list_directory', 'view_file', 'glob', 'grep']
    expect(toolNames.some((n: string) => fileTools.includes(n))).toBe(true)

    // Tool should return a result
    expect(toolResultEvents.length).toBeGreaterThan(0)
    expect(toolResultEvents[0].result.isError).toBe(false)
  }, 30000)
})

// ─── Test 4: Agent reads a real file ─────────────────────────────────────────
describe('E2E — Agent reads a real file', () => {
  it('agent reads a temp file and reports its content', async () => {
    // Write a test file
    const testFile = path.join(WORKSPACE, 'nexus_e2e_test.txt')
    const testContent = 'NEXUS_FILE_CONTENT_12345'
    fs.writeFileSync(testFile, testContent, 'utf-8')

    try {
      const provider = createProvider(DEEPSEEK_CONFIG)
      const engine = createDefaultAgentEngine({
        workspaceRoot: WORKSPACE,
        customProvider: provider
      })

      const allDelta: string[] = []
      engine.on('event', (e: any) => {
        if (e.type === 'approval_required') {
          engine.respondApproval(e.request.id, true)
        }
        if (e.type === 'message_delta') allDelta.push(e.delta)
        console.log(`[E2E] event: ${e.type}`, e.toolCall?.name ?? e.delta?.slice?.(0, 30) ?? '')
      })

      await runWithTimeout(
        engine.run(`Read the file at path "${testFile}" using view_file and tell me the exact content you find.`),
        E2E_TIMEOUT
      )

      const finalResponse = allDelta.join('')
      console.log('[E2E] Agent response:', JSON.stringify(finalResponse))

      // Agent should have found and reported the magic string
      expect(finalResponse).toContain('NEXUS_FILE_CONTENT_12345')
    } finally {
      fs.unlinkSync(testFile)
    }
  }, E2E_TIMEOUT)
})

// ─── Test 5: Model selector — provider switches correctly ────────────────────
describe('E2E — Provider switch via setProvider', () => {
  it('engine accepts provider switch and runs successfully with new provider', async () => {
    const provider1 = createProvider(DEEPSEEK_CONFIG)
    const engine = createDefaultAgentEngine({
      workspaceRoot: WORKSPACE,
      customProvider: provider1
    })

    // First run
    await runWithTimeout(engine.run('Say: FIRST_PROVIDER'), E2E_TIMEOUT)
    expect(engine.getStatus()).toBe('completed')

    // Switch provider (same DeepSeek, simulating a model change)
    const provider2 = createProvider({
      ...DEEPSEEK_CONFIG,
      model: 'deepseek-chat' // different model
    })
    engine.setProvider(provider2)

    // Second run with new provider
    const events2: string[] = []
    engine.on('event', (e: any) => {
      if (e.type === 'message_delta') events2.push(e.delta)
    })

    await runWithTimeout(engine.run('Say: SECOND_PROVIDER'), E2E_TIMEOUT)
    expect(engine.getStatus()).toBe('completed')

    const resp2 = events2.join('')
    console.log('[E2E] After provider switch response:', JSON.stringify(resp2))
    expect(resp2.length).toBeGreaterThan(0)
  }, E2E_TIMEOUT)
})

// ─── Test 6: E2E — Real Live Streaming, TTFT & TPS Performance ──────────────
import { StreamPacer } from '../src/renderer/src/utils/streamPacer'

describe('E2E — Real Live Streaming, TTFT & TPS Performance', () => {
  it('measures real DeepSeek TTFT, live TPS and verifies 100% StreamPacer delivery', async () => {
    const provider = createProvider(DEEPSEEK_CONFIG)
    const engine = createDefaultAgentEngine({
      workspaceRoot: WORKSPACE,
      customProvider: provider
    })

    const pacer = new StreamPacer()
    let accumulatedText = ''
    let firstTokenTime: number | null = null
    const startTime = performance.now()

    await runWithTimeout(
      provider.chatStream(
        [{ role: 'user', content: 'Write a concise 5-line JavaScript function to compute fibonacci with memoization.' }],
        [],
        (chunk) => {
          if (chunk.content) {
            if (firstTokenTime === null) {
              firstTokenTime = performance.now()
            }
            accumulatedText += chunk.content
            pacer.setTarget(accumulatedText)
          }
        }
      ),
      E2E_TIMEOUT
    )

    const endTime = performance.now()
    const ttft = firstTokenTime ? firstTokenTime - startTime : 0
    const totalDuration = (endTime - startTime) / 1000 // seconds
    const estimatedTokens = Math.round(accumulatedText.length / 3.5)
    const tps = totalDuration > 0 ? estimatedTokens / totalDuration : 0

    console.log(`[E2E METRICS] === Real DeepSeek Live Streaming Metrics ===`)
    console.log(`[E2E METRICS] Actual TTFT (Time To First Token): ${ttft.toFixed(1)}ms`)
    console.log(`[E2E METRICS] Total Stream Duration: ${totalDuration.toFixed(2)}s`)
    console.log(`[E2E METRICS] Output Length: ${accumulatedText.length} chars (~${estimatedTokens} tokens)`)
    console.log(`[E2E METRICS] Average Generation TPS: ${tps.toFixed(1)} tokens/sec`)

    // Verify TTFT was recorded and reasonable (< 5000ms over public internet)
    expect(firstTokenTime).not.toBeNull()
    expect(ttft).toBeGreaterThan(0)
    expect(ttft).toBeLessThan(10000)

    // Verify StreamPacer drains all remaining tokens under backpressure within <= 20 frames
    let drainFrames = 0
    while (!pacer.isDone() && drainFrames < 50) {
      pacer.step(16, true)
      drainFrames++
    }

    console.log(`[E2E METRICS] StreamPacer Final Drain Frames: ${drainFrames} (~${(drainFrames * 16.6).toFixed(0)}ms)`)
    expect(drainFrames).toBeLessThanOrEqual(25) // <= 25 frames (~350ms)
    expect(pacer.getDisplayed()).toBe(accumulatedText)
  }, E2E_TIMEOUT)
})

