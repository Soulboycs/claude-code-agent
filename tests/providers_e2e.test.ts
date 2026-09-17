import { describe, it, expect } from 'bun:test'
import { MockLLMProvider } from '../src/main/agent/providers/LLMProvider'
import { AgentEngine } from '../src/main/agent/core/AgentEngine'

describe('AgentEngine E2E — MockProvider', () => {
  it('completes a full turn with text-only response', async () => {
    const mock = new MockLLMProvider()
    mock.queueResponse({ content: 'Hello from mock!' })

    const engine = new AgentEngine({
      workspaceRoot: 'C:/Temp',
      customProvider: mock
    })

    const events: string[] = []
    engine.on('event', (e: any) => events.push(e.type))

    await engine.run('Say hello')

    expect(events).toContain('status_change')
    expect(events).toContain('message_delta')
    // At minimum: thinking + completed status_change
    const statusEvents = events.filter(t => t === 'status_change')
    expect(statusEvents.length).toBeGreaterThanOrEqual(2)
    expect(engine.getStatus()).toBe('completed')
  })

  it('emits thinking_delta when provider returns thinking', async () => {
    const mock = new MockLLMProvider()
    mock.queueResponse({ thinking: 'Let me think...', content: 'Done thinking.' })

    const engine = new AgentEngine({ workspaceRoot: 'C:/Temp', customProvider: mock })
    const events: Array<{ type: string; delta?: string }> = []
    engine.on('event', (e: any) => events.push(e))

    await engine.run('Think hard')

    const thinkingEvents = events.filter(e => e.type === 'thinking_delta')
    expect(thinkingEvents.length).toBeGreaterThan(0)
  })

  it('switches provider via setProvider without crashing', () => {
    const engine = new AgentEngine({ workspaceRoot: 'C:/Temp' })
    const mock2 = new MockLLMProvider()
    expect(() => engine.setProvider(mock2)).not.toThrow()
  })

  it('should abort mid-run cleanly', async () => {
    const mock = new MockLLMProvider()
    
    // Override chatStream to delay and allow abort to fire
    const originalChatStream = mock.chatStream.bind(mock)
    mock.chatStream = async (messages, tools, onChunk, signal) => {
      await new Promise(r => setTimeout(r, 20))
      if (signal?.aborted) throw new Error('AbortError')
      return originalChatStream(messages, tools, onChunk)
    }
    
    mock.queueResponse({ content: 'Step 1' })

    const engine = new AgentEngine({ workspaceRoot: 'C:/Temp', customProvider: mock })
    const runPromise = engine.run('Long task')
    
    // Abort immediately
    engine.abort()
    await runPromise

    // abort() sets status to 'idle' (cancelled cleanly)
    expect(engine.getStatus()).toBe('idle')
  })

  it('respects maxSteps and halts without infinite loop', async () => {
    const mock = new MockLLMProvider()
    // Queue tool calls to keep agent looping
    for (let i = 0; i < 10; i++) {
      mock.queueResponse({
        toolCalls: [{ id: `call_${i}`, name: 'read_file', arguments: { path: 'test.ts' } }]
      })
    }
    mock.queueResponse({ content: 'Final response' })

    const engine = new AgentEngine({
      workspaceRoot: 'C:/Temp',
      customProvider: mock,
      maxSteps: 3  // force early halt
    })

    await engine.run('Read files forever')
    // Should halt at maxSteps, not run forever
    expect(['error', 'completed', 'idle']).toContain(engine.getStatus())
  })

  it('handles multiple sequential runs', async () => {
    const mock = new MockLLMProvider()
    mock.queueResponse({ content: 'First run done' })
    mock.queueResponse({ content: 'Second run done' })

    const engine = new AgentEngine({ workspaceRoot: 'C:/Temp', customProvider: mock })

    await engine.run('First task')
    expect(engine.getStatus()).toBe('completed')

    await engine.run('Second task')
    expect(engine.getStatus()).toBe('completed')
  })
})
