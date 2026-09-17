import { describe, it, expect } from 'bun:test'
import { logger, maskSensitiveData } from '../src/main/utils/logger'
import * as fs from 'fs'

describe('Logger & Observability — TDD: 结构化日志系统', () => {
  it('masks sensitive API keys in strings and nested objects', () => {
    // 合成的同形状假 key（sk- + 32 hex）— 脱敏逻辑只依赖形状，严禁用真实凭据做测试输入
    const rawApiKey = 'sk-0f1e2d3c4b5a69788796a5b4c3d2e1f0'
    const masked = maskSensitiveData(rawApiKey)
    expect(masked).not.toContain('0f1e2d3c4b5a69788796a5b4c3d2e1f0')
    expect(masked).toContain('***')

    const obj = { apiKey: rawApiKey, model: 'deepseek-chat', prompt: 'test' }
    const maskedObj = maskSensitiveData(obj)
    expect(maskedObj.apiKey).toContain('***')
    expect(maskedObj.model).toBe('deepseek-chat')
  })

  it('writes structured log entries with level, module, and timestamp to log file', () => {
    logger.info('TestModule', 'Hello observability test log message', { count: 42 })

    const logPath = logger.getLogFilePath()
    expect(fs.existsSync(logPath)).toBe(true)

    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('[TestModule]')
    expect(content).toContain('Hello observability test log message')
    expect(content).toContain('42')
  })

  it('handles error objects with full stack traces', () => {
    const err = new Error('Simulated LLM API failure')
    logger.error('LLMProvider', 'Request failed', err)

    const logPath = logger.getLogFilePath()
    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('[ERROR]')
    expect(content).toContain('Simulated LLM API failure')
  })
})
