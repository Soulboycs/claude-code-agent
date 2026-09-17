export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'ollama' | 'openai-compatible'
export type SpeedTier = 'fast' | 'medium' | 'slow'
export type IntelligenceTier = 'low' | 'medium' | 'high'

export interface ModelDef {
  id: string           // model id 传给 API
  name: string         // 显示名称
  provider: ProviderType
  speed: SpeedTier
  intelligence: IntelligenceTier
  thinking?: boolean   // 是否有 thinking/reasoning
  description?: string
}

export const MODEL_CATALOG: ModelDef[] = [
  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', speed: 'fast', intelligence: 'high' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', speed: 'medium', intelligence: 'high', thinking: true },
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', speed: 'fast', intelligence: 'high' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', speed: 'fast', intelligence: 'medium' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', speed: 'fast', intelligence: 'high' },
  // Anthropic
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', speed: 'fast', intelligence: 'high', thinking: true },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', speed: 'slow', intelligence: 'high', thinking: true },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5', provider: 'anthropic', speed: 'fast', intelligence: 'medium' },
  // Gemini
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash Medium', provider: 'gemini', speed: 'fast', intelligence: 'medium' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', speed: 'fast', intelligence: 'medium' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', speed: 'medium', intelligence: 'high' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', speed: 'medium', intelligence: 'high', thinking: true },
  // Ollama (local)
  { id: 'llama3.2', name: 'Llama 3.2 (Local)', provider: 'ollama', speed: 'fast', intelligence: 'medium' },
  { id: 'qwen2.5-coder', name: 'Qwen2.5 Coder (Local)', provider: 'ollama', speed: 'fast', intelligence: 'medium' },
]

export function getModelDef(modelId: string): ModelDef | undefined {
  return MODEL_CATALOG.find(m => m.id === modelId)
}
