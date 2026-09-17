/**
 * TDD Test Suite: Chat Reducer & Event Ordering Engine
 *
 * Requirements:
 * 1. Deduplication & Idempotency:
 *    - Strict single-message lifecycle per turn.
 *    - Duplicate events (e.g. repeated status_change, repeated tool_call_start with same id) must be idempotent.
 *    - No duplicate assistant messages or orphaned preview blocks.
 * 2. Streaming Output & Event Ordering:
 *    - Strict FIFO sequence: thinking_delta -> message_delta -> tool_call -> tool_result -> status_change.
 *    - In-place stream accumulation on the active turn message.
 */
import { describe, it, expect, beforeEach } from 'bun:test'
import {
  createInitialChatState,
  chatReducer,
  ChatState,
  startUserTurn
} from '../src/renderer/src/utils/chatReducer'
import { AgentEvent, ToolCallPayload, ToolResultPayload } from '../src/shared/types'

describe('Chat State Machine — TDD: 去重与幂等性 (Deduplication & Idempotency)', () => {
  let state: ChatState

  beforeEach(() => {
    state = createInitialChatState()
  })

  it('creates exactly 1 user message and 1 assistant placeholder on startUserTurn', () => {
    state = startUserTurn(state, 'Hello assistant', 'turn-001')

    expect(state.messages.length).toBe(2)
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('Hello assistant')
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].id).toBe('turn-001')
    expect(state.messages[1].isStreaming).toBe(true)
    expect(state.activeTurnId).toBe('turn-001')
  })

  it('calling startUserTurn with the same turnId twice is idempotent', () => {
    state = startUserTurn(state, 'Hello assistant', 'turn-001')
    state = startUserTurn(state, 'Hello assistant', 'turn-001') // duplicate call

    expect(state.messages.length).toBe(2)
  })

  it('repeated status_change (completed, then idle) does NOT duplicate assistant messages', () => {
    state = startUserTurn(state, 'Test prompt', 'turn-001')

    // Stream some content
    state = chatReducer(state, { type: 'message_delta', delta: 'Here is the answer.' })

    // First completion event
    state = chatReducer(state, { type: 'status_change', status: 'completed' })
    expect(state.messages.length).toBe(2)
    expect(state.messages[1].content).toBe('Here is the answer.')
    expect(state.messages[1].isStreaming).toBe(false)
    expect(state.activeTurnId).toBeNull()

    // Second event (idle) — must be completely idempotent
    state = chatReducer(state, { type: 'status_change', status: 'idle' })
    expect(state.messages.length).toBe(2) // Still exactly 2 messages, no duplicates!
    expect(state.messages[1].content).toBe('Here is the answer.')
  })

  it('repeated tool_call_start with same id does not register duplicate tools', () => {
    state = startUserTurn(state, 'Read file', 'turn-001')

    const tc: ToolCallPayload = { id: 'call_123', name: 'view_file', arguments: { path: 'test.ts' } }

    state = chatReducer(state, { type: 'tool_call_start', toolCall: tc })
    state = chatReducer(state, { type: 'tool_call_start', toolCall: tc }) // duplicate event

    expect(state.messages[1].toolCalls?.length).toBe(1)
  })

  it('repeated tool_call_complete updates in-place idempotently', () => {
    state = startUserTurn(state, 'Read file', 'turn-001')
    const tc: ToolCallPayload = { id: 'call_123', name: 'view_file', arguments: { path: 'test.ts' } }
    state = chatReducer(state, { type: 'tool_call_start', toolCall: tc })

    const res: ToolResultPayload = { toolCallId: 'call_123', name: 'view_file', output: 'content', isError: false }
    state = chatReducer(state, { type: 'tool_call_complete', result: res })
    state = chatReducer(state, { type: 'tool_call_complete', result: res }) // duplicate result event

    expect(state.messages[1].toolResults?.length).toBe(1)
  })

  it('handles start_turn action idempotently via chatReducer dispatch', () => {
    state = chatReducer(state, { type: 'start_turn', prompt: 'Hello via dispatch', turnId: 'turn-dispatch-1' } as any)
    expect(state.messages.length).toBe(2)
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('Hello via dispatch')
    expect(state.messages[1].role).toBe('assistant')
    expect(state.activeTurnId).toBe('turn-dispatch-1')

    // Calling it again with same turnId is idempotent
    state = chatReducer(state, { type: 'start_turn', prompt: 'Hello via dispatch', turnId: 'turn-dispatch-1' } as any)
    expect(state.messages.length).toBe(2)
  })
})

describe('Chat State Machine — TDD: 流式输出与事件顺序性 (Streaming & Event Ordering)', () => {
  let state: ChatState

  beforeEach(() => {
    state = createInitialChatState()
  })

  it('accumulates thinking_delta and message_delta in strict order within the active turn', () => {
    state = startUserTurn(state, 'How does this work?', 'turn-002')

    // 1. Thinking phase
    state = chatReducer(state, { type: 'thinking_delta', delta: 'Let me ' })
    state = chatReducer(state, { type: 'thinking_delta', delta: 'think about it.' })

    const asstMsg = state.messages[1]
    expect(asstMsg.thinking).toBe('Let me think about it.')
    expect(asstMsg.content).toBe('')

    // 2. Message response phase
    state = chatReducer(state, { type: 'message_delta', delta: 'Here is ' })
    state = chatReducer(state, { type: 'message_delta', delta: 'the explanation.' })

    expect(state.messages[1].thinking).toBe('Let me think about it.')
    expect(state.messages[1].content).toBe('Here is the explanation.')

    // 3. Finish
    state = chatReducer(state, { type: 'status_change', status: 'completed' })
    expect(state.messages[1].isStreaming).toBe(false)
  })

  it('interleaves tool calls and subsequent answer in strict chronological order', () => {
    state = startUserTurn(state, 'Check files', 'turn-003')

    // Step 1: Tool call
    const tc: ToolCallPayload = { id: 'call_1', name: 'list_directory', arguments: { path: '.' } }
    state = chatReducer(state, { type: 'tool_call_start', toolCall: tc })
    expect(state.messages[1].toolCalls?.length).toBe(1)
    expect(state.messages[1].toolResults?.length).toBe(0)

    // Tool finishes
    const tr: ToolResultPayload = { toolCallId: 'call_1', name: 'list_directory', output: 'file1.ts\nfile2.ts', isError: false }
    state = chatReducer(state, { type: 'tool_call_complete', result: tr })
    expect(state.messages[1].toolResults?.length).toBe(1)

    // Step 2: Final message based on tool result
    state = chatReducer(state, { type: 'message_delta', delta: 'Found 2 files: file1.ts and file2.ts' })
    expect(state.messages[1].content).toBe('Found 2 files: file1.ts and file2.ts')

    // Complete
    state = chatReducer(state, { type: 'status_change', status: 'completed' })
    expect(state.messages[1].isStreaming).toBe(false)
    expect(state.activeTurnId).toBeNull()
  })

  it('handles abort cleanly: finalizes current streaming message without duplicating', () => {
    state = startUserTurn(state, 'Long task', 'turn-004')
    state = chatReducer(state, { type: 'message_delta', delta: 'Partial text...' })

    // User aborts -> status_change idle
    state = chatReducer(state, { type: 'status_change', status: 'idle' })

    expect(state.messages[1].content).toBe('Partial text...')
    expect(state.messages[1].isStreaming).toBe(false)
    expect(state.activeTurnId).toBeNull()

    // Next turn starts cleanly
    state = startUserTurn(state, 'New task', 'turn-005')
    expect(state.messages.length).toBe(4) // 2 previous + 2 new
    expect(state.activeTurnId).toBe('turn-005')
  })

  it('resets state completely on clear action', () => {
    state = startUserTurn(state, 'Clear me', 'turn-clear')
    expect(state.messages.length).toBe(2)
    state = chatReducer(state, { type: 'clear' })
    expect(state.messages.length).toBe(0)
    expect(state.activeTurnId).toBeNull()
  })

  it('preserves error message in assistant content on status_change error', () => {
    state = startUserTurn(state, 'Fail me', 'turn-err-1')
    state = chatReducer(state, { type: 'status_change', status: 'error', message: 'API rate limit exceeded' })
    expect(state.messages[1].content).toBe('[Error: API rate limit exceeded]')
    expect(state.messages[1].isStreaming).toBe(false)
    expect(state.activeTurnId).toBeNull()
  })

  it('attaches late error event to last assistant message even after activeTurnId is null', () => {
    state = startUserTurn(state, 'Fail late', 'turn-err-2')
    // First closed by status_change
    state = chatReducer(state, { type: 'status_change', status: 'error' })
    expect(state.activeTurnId).toBeNull()
    // Then late error event arrives
    state = chatReducer(state, { type: 'error', message: 'Network disconnected' })
    expect(state.messages[1].content).toContain('[Error: Network disconnected]')
  })
})
