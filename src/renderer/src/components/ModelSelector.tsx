import React, { useState, useRef, useEffect } from 'react'
import { MODEL_CATALOG, getModelDef, ProviderType } from '../../../shared/models'

interface ModelSelectorProps {
  currentModelId: string
  onModelChange: (modelId: string) => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ currentModelId, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentModel = getModelDef(currentModelId)

  const PROVIDER_GROUPS: { label: string; models: typeof MODEL_CATALOG }[] = [
    { label: 'DeepSeek', models: MODEL_CATALOG.filter((m) => m.provider === 'deepseek') },
    { label: 'OpenAI', models: MODEL_CATALOG.filter((m) => m.provider === 'openai') },
    { label: 'Anthropic', models: MODEL_CATALOG.filter((m) => m.provider === 'anthropic') },
    { label: 'Google', models: MODEL_CATALOG.filter((m) => m.provider === 'gemini') },
    { label: 'Ollama (Local)', models: MODEL_CATALOG.filter((m) => m.provider === 'ollama') }
  ]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelect = async (modelId: string) => {
    setIsOpen(false)
    if (modelId !== currentModelId) {
      await window.electronAPI?.switchModel?.(modelId)
      onModelChange(modelId)
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 bg-[#1a1b22] hover:bg-[#22232d] border border-[#2b2d38] rounded-md text-sm font-medium text-gray-300 transition-colors"
      >
        <span>{currentModel?.name || currentModelId || 'Select Model'}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-md bg-[#1a1b22] border border-[#2b2d38] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 max-h-[70vh] overflow-y-auto">
          <div className="py-1">
            {PROVIDER_GROUPS.map((group) => {
              if (group.models.length === 0) return null
              return (
                <div key={group.label} className="mb-2">
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model.id)}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#22232d] transition-colors ${
                        currentModelId === model.id ? 'text-blue-400 bg-[#22232d]/50' : 'text-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span>{model.name}</span>
                        {model.thinking && <span title="Thinking model">💭</span>}
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-gray-500 capitalize">{model.intelligence}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#2b2d38] text-gray-400 capitalize">
                          {model.speed}
                        </span>
                        {currentModelId === model.id && (
                          <span className="text-blue-400 ml-1">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
