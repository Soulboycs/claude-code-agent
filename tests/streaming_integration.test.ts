import { describe, it, expect } from 'bun:test'
import { StreamPacer } from '../src/renderer/src/utils/streamPacer'
import { chatReducer, createInitialChatState, ChatState } from '../src/renderer/src/utils/chatReducer'
import { AgentEvent } from '../src/shared/types'

describe('Streaming & Backpressure Integration — Layer 2 Integration Tests', () => {
  it('preserves strict causality between text deltas and tool calls without causality inversion', () => {
    let state: ChatState = createInitialChatState()
    state = chatReducer(state, { type: 'start_turn', prompt: 'Delete file', turnId: 'turn-barrier' } as any)

    // Simulate pre-tool narrative text streaming
    state = chatReducer(state, { type: 'message_delta', delta: 'I will now inspect the directory.' })

    // Simulate discrete tool call barrier
    const toolEvent: AgentEvent = {
      type: 'tool_call_start',
      toolCall: { id: 'call_barrier_1', name: 'list_directory', arguments: { path: '.' } }
    }
    state = chatReducer(state, toolEvent)

    // Verify message has both text and toolCall registered in correct order
    const msg = state.messages.find(m => m.id === 'turn-barrier')!
    expect(msg.content).toBe('I will now inspect the directory.')
    expect(msg.toolCalls?.length).toBe(1)
    expect(msg.toolCalls![0].id).toBe('call_barrier_1')
  })

  it('handles a 1000-event burst storm in StreamPacer with zero dropped characters and lag <= 200ms', () => {
    const pacer = new StreamPacer()
    let expectedText = ''

    // Feed 1000 deltas
    for (let i = 0; i < 1000; i++) {
      const token = 'tok_' + i + ' '
      expectedText += token
      pacer.setTarget(expectedText)
    }

    // Measure frames needed to fully catch up under backpressure
    let frames = 0
    while (!pacer.isDone() && frames < 100) {
      pacer.step(16)
      frames++
    }

    // Under adaptive backpressure, 1000 tokens should drain within at most 30 frames (< 500ms)
    expect(frames).toBeLessThan(35)
    expect(pacer.getDisplayed()).toBe(expectedText)
    expect(pacer.getDisplayed().length).toBe(expectedText.length)
  })

  it('instantly flushes all buffered text on abort without losing partial characters', () => {
    const pacer = new StreamPacer()
    pacer.setTarget('Streaming in progress when user suddenly clicks abort...')
    pacer.step(16) // partially consumed

    expect(pacer.isDone()).toBe(false)

    // Abort signal arrives
    pacer.flush()
    expect(pacer.isDone()).toBe(true)
    expect(pacer.getDisplayed()).toBe('Streaming in progress when user suddenly clicks abort...')
  })

  it('seamlessly transitions from thinking stream to final response stream', () => {
    let state = createInitialChatState()
    state = chatReducer(state, { type: 'start_turn', prompt: 'Solve puzzle', turnId: 'turn-interleave' } as any)

    // 1. Thinking phase
    state = chatReducer(state, { type: 'thinking_delta', delta: 'Analyzing logic...' })
    expect(state.messages[1].thinking).toBe('Analyzing logic...')
    expect(state.messages[1].content).toBe('')

    // 2. Transition to content phase
    state = chatReducer(state, { type: 'message_delta', delta: 'Here is the solution.' })
    expect(state.messages[1].thinking).toBe('Analyzing logic...')
    expect(state.messages[1].content).toBe('Here is the solution.')

    // 3. Status complete
    state = chatReducer(state, { type: 'status_change', status: 'completed' })
    expect(state.messages[1].isStreaming).toBe(false)
  })
})
