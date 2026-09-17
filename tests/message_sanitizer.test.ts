import { describe, it, expect } from 'bun:test'
import { sanitizeConversationHistory } from '../src/main/agent/utils/messageSanitizer'
import { LLMMessage } from '../src/main/agent/providers/LLMProvider'

describe('Message Sanitizer — TDD: 彻底杜绝 LLM API 400 错误', () => {
  it('ensures assistant message with tool_calls always has non-undefined content', () => {
    const raw: LLMMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: undefined, // empty text, only called tool
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list', arguments: '{}' } }]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'files' }
    ]

    const sanitized = sanitizeConversationHistory(raw)
    const asst = sanitized[1]
    expect(asst.content).not.toBeUndefined()
    expect(asst.content === null || asst.content === '').toBe(true)
    expect(asst.tool_calls?.length).toBe(1)
  })

  it('merges consecutive user messages to prevent DeepSeek 400 role alternation error', () => {
    const raw: LLMMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'First message' },
      { role: 'user', content: 'Second message' }
    ]

    const sanitized = sanitizeConversationHistory(raw)
    // Should be merged into 1 system + 1 user message
    expect(sanitized.length).toBe(2)
    expect(sanitized[1].role).toBe('user')
    expect(sanitized[1].content).toContain('First message')
    expect(sanitized[1].content).toContain('Second message')
  })

  it('synthesizes missing tool responses for dangling tool_calls caused by abort or error', () => {
    const raw: LLMMessage[] = [
      { role: 'user', content: 'Read file' },
      {
        role: 'assistant',
        content: 'I will read it',
        tool_calls: [{ id: 'dangling_call_1', type: 'function', function: { name: 'view_file', arguments: '{}' } }]
      }
      // Missing role: 'tool' message because user hit Abort mid-flight!
    ]

    const sanitized = sanitizeConversationHistory(raw)
    // Must contain a synthetic tool message so DeepSeek never throws 400!
    const toolMsg = sanitized.find(m => m.role === 'tool' && m.tool_call_id === 'dangling_call_1')
    expect(toolMsg).toBeDefined()
    expect(toolMsg?.content).toContain('[Execution aborted')
  })

  it('removes orphaned tool messages that have no preceding tool_calls', () => {
    const raw: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
      { role: 'tool', tool_call_id: 'unknown_orphan', content: 'orphaned result' }
    ]

    const sanitized = sanitizeConversationHistory(raw)
    expect(sanitized.some(m => m.tool_call_id === 'unknown_orphan')).toBe(false)
  })

  it('handles null, undefined, or empty history array', () => {
    expect(sanitizeConversationHistory([]).length).toBe(0)
    expect(sanitizeConversationHistory(null as any).length).toBe(0)
    expect(sanitizeConversationHistory(undefined as any).length).toBe(0)
  })

  it('normalizes undefined content on user and system messages', () => {
    const raw: LLMMessage[] = [
      { role: 'system', content: undefined },
      { role: 'user', content: undefined }
    ]
    const sanitized = sanitizeConversationHistory(raw)
    expect(sanitized[0].content).toBe('')
    expect(sanitized[1].content).toBe('')
  })

  it('synthesizes missing tool responses in the MIDDLE of history when followed by user message', () => {
    const raw: LLMMessage[] = [
      { role: 'user', content: 'step 1' },
      {
        role: 'assistant',
        content: 'calling tool',
        tool_calls: [{ id: 'mid_call', type: 'function', function: { name: 'list_files', arguments: '{}' } }]
      },
      // User sent another prompt before tool response was recorded!
      { role: 'user', content: 'stop that, do something else' }
    ]
    const sanitized = sanitizeConversationHistory(raw)
    expect(sanitized.length).toBe(4)
    expect(sanitized[2].role).toBe('tool')
    expect(sanitized[2].tool_call_id).toBe('mid_call')
    expect(sanitized[3].role).toBe('user')
    expect(sanitized[3].content).toBe('stop that, do something else')
  })
})
