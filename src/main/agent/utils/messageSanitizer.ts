import { LLMMessage } from '../providers/LLMProvider'

/**
 * Sanitizes conversation history before sending to LLM API (DeepSeek, OpenAI, Anthropic).
 *
 * Prevents common HTTP 400 Bad Request triggers:
 * 1. Assistant messages with `tool_calls` having `undefined` content.
 * 2. Dangling `tool_calls` where execution was aborted before `role: 'tool'` was recorded.
 * 3. Orphaned `role: 'tool'` messages without matching assistant `tool_calls`.
 * 4. Consecutive `user` messages that violate role alternation constraints.
 */
export function sanitizeConversationHistory(history: LLMMessage[]): LLMMessage[] {
  if (!history || history.length === 0) {
    return []
  }

  // Phase 1: Deep copy and normalize content fields
  const step1: LLMMessage[] = history.map((msg) => {
    const copy: LLMMessage = { ...msg }
    if (copy.role === 'assistant') {
      if (copy.content === undefined) {
        copy.content = ''
      }
    } else if (copy.content === undefined) {
      copy.content = ''
    }
    return copy
  })

  // Phase 2: Identify valid tool_calls and handle dangling / orphaned tool messages
  const activeToolCallIds = new Set<string>()
  for (const msg of step1) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        activeToolCallIds.add(tc.id)
      }
    }
  }

  const step2: LLMMessage[] = []
  let pendingToolCalls: Array<{ id: string; name: string }> = []

  for (let i = 0; i < step1.length; i++) {
    const msg = step1[i]

    if (msg.role === 'tool') {
      // If this tool message responds to a declared tool call, keep it
      if (msg.tool_call_id && activeToolCallIds.has(msg.tool_call_id)) {
        pendingToolCalls = pendingToolCalls.filter((tc) => tc.id !== msg.tool_call_id)
        step2.push(msg)
      }
      // Orphaned tool message is safely discarded
      continue
    }

    // If we have pending tool calls from a previous assistant message, but the current
    // message is NOT a tool response, synthesize tool responses for all unresolved calls.
    if (pendingToolCalls.length > 0) {
      for (const pending of pendingToolCalls) {
        step2.push({
          role: 'tool',
          tool_call_id: pending.id,
          content: `[Execution aborted or cancelled for ${pending.name}]`
        })
      }
      pendingToolCalls = []
    }

    step2.push(msg)

    // If this message is assistant with tool_calls, track them as pending
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        pendingToolCalls.push({ id: tc.id, name: tc.function.name })
      }
    }
  }

  // If there are still pending tool calls at the end of the history, resolve them
  if (pendingToolCalls.length > 0) {
    for (const pending of pendingToolCalls) {
      step2.push({
        role: 'tool',
        tool_call_id: pending.id,
        content: `[Execution aborted or cancelled for ${pending.name}]`
      })
    }
    pendingToolCalls = []
  }

  // Phase 3: Merge consecutive user messages to maintain strict alternating structure
  const step3: LLMMessage[] = []
  for (const msg of step2) {
    if (step3.length > 0) {
      const prev = step3[step3.length - 1]
      if (prev.role === 'user' && msg.role === 'user') {
        prev.content = `${prev.content || ''}\n\n${msg.content || ''}`.trim()
        continue
      }
    }
    step3.push(msg)
  }

  return step3
}
