import { AgentEvent, ChatMessage } from '../../../../src/shared/types'

export interface ChatState {
  messages: ChatMessage[]
  activeTurnId: string | null
}

export function createInitialChatState(): ChatState {
  return {
    messages: [],
    activeTurnId: null
  }
}

/**
 * Initiates a user prompt and provisions a single streaming assistant placeholder.
 * Strictly idempotent: invoking with the same turnId will not create duplicate messages.
 */
export function startUserTurn(state: ChatState, prompt: string, turnId: string): ChatState {
  if (state.activeTurnId === turnId) {
    return state
  }

  const now = Date.now()
  const userMsgId = `user_${now}_${Math.random().toString(36).slice(2, 7)}`

  // Defensively seal any prior streaming messages so old turns never keep streaming
  const sanitizedMessages = state.messages.map((msg) =>
    msg.isStreaming ? { ...msg, isStreaming: false } : msg
  )

  return {
    messages: [
      ...sanitizedMessages,
      {
        id: userMsgId,
        role: 'user',
        content: prompt,
        timestamp: now
      },
      {
        id: turnId,
        role: 'assistant',
        content: '',
        thinking: '',
        toolCalls: [],
        toolResults: [],
        isStreaming: true,
        timestamp: now
      }
    ],
    activeTurnId: turnId
  }
}

export type ChatAction =
  | AgentEvent
  | { type: 'start_turn'; prompt: string; turnId: string }
  | { type: 'clear' }

/**
 * Pure state reducer processing Agent streaming events in strict FIFO order.
 * Guarantees in-place updates, zero message duplication, and idempotency on status changes.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'start_turn') {
    return startUserTurn(state, action.prompt, action.turnId)
  }

  if (action.type === 'clear') {
    return createInitialChatState()
  }

  const activeId = state.activeTurnId

  switch (action.type) {
    case 'thinking_delta': {
      if (!activeId) return state
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === activeId
            ? { ...msg, thinking: (msg.thinking || '') + action.delta }
            : msg
        )
      }
    }

    case 'message_delta': {
      if (!activeId) return state
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === activeId
            ? { ...msg, content: (msg.content || '') + action.delta }
            : msg
        )
      }
    }

    case 'tool_call_start': {
      if (!activeId) return state
      return {
        ...state,
        messages: state.messages.map((msg) => {
          if (msg.id !== activeId) return msg
          const existing = msg.toolCalls || []
          if (existing.some((tc) => tc.id === action.toolCall.id)) return msg
          return { ...msg, toolCalls: [...existing, action.toolCall] }
        })
      }
    }

    case 'tool_call_complete': {
      if (!activeId) return state
      return {
        ...state,
        messages: state.messages.map((msg) => {
          if (msg.id !== activeId) return msg
          const existingResults = msg.toolResults || []
          const updatedResults = existingResults.some(
            (r) => r.toolCallId === action.result.toolCallId
          )
            ? existingResults.map((r) =>
                r.toolCallId === action.result.toolCallId ? action.result : r
              )
            : [...existingResults, action.result]
          return { ...msg, toolResults: updatedResults }
        })
      }
    }

    case 'status_change': {
      if (
        action.status === 'completed' ||
        action.status === 'error' ||
        action.status === 'idle'
      ) {
        if (!activeId) return state // Already finalized — completely idempotent
        return {
          messages: state.messages.map((msg) =>
            msg.id === activeId
              ? {
                  ...msg,
                  content:
                    action.status === 'error' && action.message && !msg.content
                      ? `[Error: ${action.message}]`
                      : msg.content,
                  isStreaming: false
                }
              : msg
          ),
          activeTurnId: null
        }
      }
      return state
    }

    case 'error': {
      const targetId =
        activeId ||
        (state.messages.length > 0
          ? state.messages[state.messages.length - 1].id
          : null)
      if (!targetId) return state
      return {
        messages: state.messages.map((msg) =>
          msg.id === targetId
            ? {
                ...msg,
                content: msg.content
                  ? (msg.content.includes(action.message) ? msg.content : `${msg.content}\n\n[Error: ${action.message}]`)
                  : `[Error: ${action.message}]`,
                isStreaming: false
              }
            : msg
        ),
        activeTurnId: null
      }
    }

    default:
      return state
  }
}
