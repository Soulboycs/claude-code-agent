import { describe, it, expect } from 'bun:test'
import { ToolRegistry } from '../src/main/agent/tools/ToolRegistry'
import { ToolOrchestrator } from '../src/agent/core/ToolOrchestrator'
import { MockLLMProvider } from '../src/main/agent/providers/LLMProvider'
import { query } from '../src/agent/core/query'
import { AgentEvent } from '../src/shared/types'
import { z } from 'zod'

describe('Query AsyncGenerator State Machine Tests', () => {
  it('iterates through tool call and completes naturally with no recursion', async () => {
    const registry = new ToolRegistry()
    registry.registerTool({
      name: 'echo_test',
      description: 'Echo test',
      parameters: z.object({ text: z.string() }),
      isReadOnly: () => true,
      isConcurrencySafe: () => true,
      execute: async ({ text }: { text: string }) => `Echo: ${text}`,
    } as any)

    const orchestrator = new ToolOrchestrator(registry)
    const mockProvider = new MockLLMProvider()

    // Turn 1: Model calls tool
    mockProvider.queueResponse({
      thinking: 'Calling echo tool',
      toolCalls: [
        {
          id: 'call_1',
          name: 'echo_test',
          arguments: { text: 'Hello Bun!' },
        },
      ],
    })

    // Turn 2: Model finishes task
    mockProvider.queueResponse({
      thinking: 'Done',
      content: 'Echo finished successfully!',
    })

    const events: AgentEvent[] = []
    const q = query({
      messages: [{ role: 'user', content: 'Say hello' }],
      toolRegistry: registry,
      orchestrator,
      provider: mockProvider,
      workspaceRoot: '.',
    })

    for await (const event of q) {
      events.push(event)
    }

    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toContain('status_change')
    expect(eventTypes).toContain('thinking_delta')
    expect(eventTypes).toContain('tool_call_start')
    expect(eventTypes).toContain('tool_call_complete')
    expect(eventTypes).toContain('message_delta')

    // Find final completion status
    const completedEvent = events.find(
      (e) => e.type === 'status_change' && e.status === 'completed'
    )
    expect(completedEvent).toBeDefined()
  })

  it('pauses and awaits user confirmation for dangerous actions', async () => {
    const registry = new ToolRegistry()
    registry.registerTool({
      name: 'rm_danger',
      description: 'Dangerous remove tool',
      parameters: z.object({ target: z.string() }),
      requiresApproval: () => true,
      execute: async () => 'deleted',
    } as any)

    const orchestrator = new ToolOrchestrator(registry)
    const mockProvider = new MockLLMProvider()

    mockProvider.queueResponse({
      toolCalls: [
        {
          id: 'call_danger',
          name: 'rm_danger',
          arguments: { target: 'system32' },
        },
      ],
    })

    mockProvider.queueResponse({
      content: 'Finished after confirmation',
    })

    let approvalHandled = false
    const q = query({
      messages: [{ role: 'user', content: 'Delete system' }],
      toolRegistry: registry,
      orchestrator,
      provider: mockProvider,
      workspaceRoot: '.',
      onApprovalRequired: async () => {
        approvalHandled = true
        return true // User approved
      },
    })

    for await (const _ of q) {
      // drain
    }

    expect(approvalHandled).toBe(true)
  })
})
