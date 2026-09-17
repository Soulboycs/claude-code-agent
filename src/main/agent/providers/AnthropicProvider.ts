import { ILLMProvider, LLMMessage, LLMStreamChunk } from './LLMProvider'
import { AgentTool } from '../tools/ToolRegistry'
import { ProviderConfig } from '@shared/types'

export class AnthropicProvider implements ILLMProvider {
  constructor(private config: ProviderConfig) {}

  async chatStream(
    messages: LLMMessage[],
    tools: AgentTool[],
    onChunk: (chunk: LLMStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<{
    fullThinking: string
    fullContent: string
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  }> {
    const url = 'https://api.anthropic.com/v1/messages'

    const formattedTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: (tool.parameters as any)._def?.shape ? extractZodProperties(tool.parameters) : {},
        required: []
      }
    }))

    // Anthropic expects system messages to be passed separately
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
    const userAndAssistantMessages = messages.filter(m => m.role !== 'system').map(m => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content || '' }
      } else if (m.role === 'assistant') {
        if (m.tool_calls && m.tool_calls.length > 0) {
          return {
            role: 'assistant',
            content: m.tool_calls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}')
            }))
          }
        }
        return { role: 'assistant', content: m.content || '' }
      } else if (m.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }
          ]
        }
      }
      return { role: 'user', content: m.content || '' }
    })

    const body: Record<string, any> = {
      model: this.config.model,
      messages: userAndAssistantMessages,
      max_tokens: 8192,
      stream: true,
      temperature: this.config.temperature ?? 0.2
    }

    if (systemMessages) {
      body.system = systemMessages
    }

    if (formattedTools.length > 0) {
      body.tools = formattedTools
    }

    // if model supports thinking, we might need to enable it, but Anthropic has specific configuration for thinking models.
    if (this.config.model.includes('claude-3-7') || this.config.model.includes('thinking')) {
      // Not specified in prompt, but let's just send the request
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.anthropicApiKey || this.config.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
    }

    if (!response.body) {
      throw new Error('LLM response body is empty.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    let fullThinking = ''
    let fullContent = ''
    const toolCallsMap = new Map<number, { id: string; name: string; argsStr: string }>()
    let currentToolCallIndex = -1

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const dataStr = line.slice(6).trim()
        if (dataStr === '[DONE]') continue
        if (!dataStr) continue

        try {
          const data = JSON.parse(dataStr)

          if (data.type === 'content_block_start') {
            if (data.content_block.type === 'tool_use') {
              currentToolCallIndex = data.index
              toolCallsMap.set(currentToolCallIndex, {
                id: data.content_block.id,
                name: data.content_block.name,
                argsStr: ''
              })
            }
          } else if (data.type === 'content_block_delta') {
            if (data.delta.type === 'text_delta') {
              const text = data.delta.text
              fullContent += text
              onChunk({ content: text })
            } else if (data.delta.type === 'thinking_delta') {
              const thinking = data.delta.thinking
              fullThinking += thinking
              onChunk({ thinking })
            } else if (data.delta.type === 'input_json_delta') {
              if (currentToolCallIndex !== -1 && toolCallsMap.has(currentToolCallIndex)) {
                const current = toolCallsMap.get(currentToolCallIndex)!
                current.argsStr += data.delta.partial_json
                onChunk({
                  toolCalls: [
                    {
                      id: current.id,
                      name: current.name,
                      arguments: current.argsStr
                    }
                  ]
                })
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const parsedToolCalls = Array.from(toolCallsMap.values()).map((tc) => {
      let argsObj = {}
      try {
        argsObj = JSON.parse(tc.argsStr || '{}')
      } catch {
        argsObj = { raw: tc.argsStr }
      }
      return {
        id: tc.id,
        name: tc.name,
        arguments: argsObj
      }
    })

    return {
      fullThinking,
      fullContent,
      toolCalls: parsedToolCalls
    }
  }
}

function extractZodProperties(zodSchema: any): Record<string, any> {
  const shape = zodSchema._def?.shape?.() || zodSchema._def?.shape || {}
  const properties: Record<string, any> = {}
  for (const [key, val] of Object.entries(shape)) {
    const desc = (val as any).description || ''
    properties[key] = {
      type: 'string', // generalized representation
      description: desc
    }
  }
  return properties
}
