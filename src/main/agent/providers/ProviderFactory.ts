import { ILLMProvider, OpenAICompatibleProvider } from './LLMProvider'
import { AnthropicProvider } from './AnthropicProvider'
import { GeminiProvider } from './GeminiProvider'
import { OllamaProvider } from './OllamaProvider'
import { ProviderConfig } from '@shared/types'

export function createProvider(config: ProviderConfig): ILLMProvider {
  switch (config.providerType) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    case 'deepseek':
      return new OpenAICompatibleProvider({ 
        ...config, 
        baseURL: 'https://api.deepseek.com/v1', 
        apiKey: config.apiKey 
      })
    case 'openai':
    case 'openai-compatible':
    default:
      return new OpenAICompatibleProvider(config)
  }
}
