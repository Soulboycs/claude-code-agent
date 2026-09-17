import { describe, it, expect } from 'bun:test'
import { createProvider } from '../src/main/agent/providers/ProviderFactory'
import { MODEL_CATALOG, getModelDef } from '../src/shared/models'

describe('ProviderFactory — unit', () => {
  it('creates OpenAI provider', () => {
    const p = createProvider({ providerType: 'openai', model: 'gpt-4o', apiKey: 'test' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })

  it('creates DeepSeek provider', () => {
    const p = createProvider({ providerType: 'deepseek', model: 'deepseek-chat', apiKey: 'test' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })

  it('creates Anthropic provider', () => {
    const p = createProvider({ providerType: 'anthropic', model: 'claude-sonnet-4-5', anthropicApiKey: 'test' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })

  it('creates Gemini provider', () => {
    const p = createProvider({ providerType: 'gemini', model: 'gemini-2.0-flash', geminiApiKey: 'test' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })

  it('creates Ollama provider', () => {
    const p = createProvider({ providerType: 'ollama', model: 'llama3.2' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })

  it('falls back to OpenAI-compatible for unknown providerType', () => {
    const p = createProvider({ providerType: 'openai-compatible', model: 'custom', apiKey: 'test', baseURL: 'http://localhost:8080' } as any)
    expect(p).toBeDefined()
    expect(typeof p.chatStream).toBe('function')
  })
})

describe('ModelCatalog — unit', () => {
  it('has at least 10 models', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(10)
  })

  it('finds deepseek-chat model', () => {
    const m = getModelDef('deepseek-chat')
    expect(m).toBeDefined()
    expect(m?.provider).toBe('deepseek')
    expect(m?.speed).toBeDefined()
    expect(m?.intelligence).toBeDefined()
  })

  it('finds claude model with thinking flag', () => {
    const m = getModelDef('claude-sonnet-4-5')
    expect(m).toBeDefined()
    expect(m?.thinking).toBe(true)
  })

  it('every model has required fields with valid enum values', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.provider).toBeTruthy()
      expect(['fast', 'medium', 'slow']).toContain(m.speed)
      expect(['low', 'medium', 'high']).toContain(m.intelligence)
    }
  })

  it('each provider type is covered in catalog', () => {
    const providers = new Set(MODEL_CATALOG.map(m => m.provider))
    expect(providers.has('openai')).toBe(true)
    expect(providers.has('anthropic')).toBe(true)
    expect(providers.has('gemini')).toBe(true)
    expect(providers.has('deepseek')).toBe(true)
    expect(providers.has('ollama')).toBe(true)
  })
})
