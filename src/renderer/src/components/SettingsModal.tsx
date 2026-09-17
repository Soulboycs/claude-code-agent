import React, { useState, useEffect } from 'react'
import { X, Key, Server, Cpu, Check, AlertCircle } from 'lucide-react'
import { ProviderConfig } from '@shared/types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<ProviderConfig>({
    provider: 'openai',
    apiKey: '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.2
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.getProviderConfig?.().then((saved) => {
        if (saved) setConfig(saved)
      })
    }
  }, [isOpen])

  const handleSave = async () => {
    setSaveStatus('idle')
    const ok = await window.electronAPI?.saveProviderConfig?.(config)
    if (ok) {
      setSaveStatus('saved')
      setTimeout(() => {
        setSaveStatus('idle')
        onClose()
      }, 800)
    } else {
      setSaveStatus('error')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#181920] border border-[#2c2d38] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#282935] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-neutral-100">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span>LLM & Model Configuration</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#252632] rounded-md text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Provider preset */}
          <div>
            <label className="block text-neutral-400 font-medium mb-1.5">Provider Preset</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'openai', label: 'OpenAI / Generic' },
                { id: 'custom', label: 'Local / Ollama' },
                { id: 'anthropic', label: 'Claude (Proxy)' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    let base = config.baseURL
                    let m = config.model
                    if (p.id === 'openai') {
                      base = 'https://api.openai.com/v1'
                      m = 'gpt-4o'
                    } else if (p.id === 'custom') {
                      base = 'http://localhost:11434/v1'
                      m = 'qwen2.5-coder:latest'
                    }
                    setConfig({
                      ...config,
                      provider: p.id as any,
                      baseURL: base,
                      model: m
                    })
                  }}
                  className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                    config.provider === p.id
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-[#1f2029] border-[#2c2d38] text-neutral-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-neutral-400 font-medium mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-neutral-500" />
              <span>API Key</span>
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-... (Leave blank if local / Ollama)"
              className="w-full bg-[#121316] border border-[#2b2c38] rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 font-mono text-xs"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-neutral-400 font-medium mb-1 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-neutral-500" />
              <span>Base URL</span>
            </label>
            <input
              type="text"
              value={config.baseURL || ''}
              onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-[#121316] border border-[#2b2c38] rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 font-mono text-xs"
            />
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-neutral-400 font-medium mb-1">Model Name</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="gpt-4o, claude-3-7-sonnet, deepseek-chat..."
              className="w-full bg-[#121316] border border-[#2b2c38] rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 font-mono text-xs"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-neutral-400 font-medium">Temperature</label>
              <span className="text-neutral-500 font-mono">{config.temperature ?? 0.2}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.temperature ?? 0.2}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-5 bg-[#14151b] border-t border-[#262733] flex items-center justify-between">
          <div>
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-400 text-xs">
                <Check className="w-3.5 h-3.5" /> Saved successfully
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-rose-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5" /> Failed to save
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#22232c] hover:bg-[#2b2c37] text-neutral-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
