import React, { useState, useRef, useEffect } from 'react'
import { MODEL_CATALOG, getModelDef } from '../../../shared/models'
import { ChevronUp } from 'lucide-react'

interface ModelSelectorProps {
  currentModelId: string
  onModelChange: (modelId: string) => void
  dropDirection?: 'up' | 'down'
  className?: string
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModelId,
  onModelChange,
  dropDirection = 'up',
  className = ''
}) => {
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

  const modelDisplayName = currentModel?.name || currentModelId || 'Select Model'

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-md hover:bg-neutral-100/90 transition-colors select-none"
      >
        <span>{modelDisplayName}</span>
        <ChevronUp
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
            isOpen ? (dropDirection === 'up' ? 'rotate-180' : 'rotate-180') : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 ${
            dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          } w-80 rounded-xl bg-white border border-neutral-200/90 shadow-xl ring-1 ring-black/5 focus:outline-none z-50 max-h-[60vh] overflow-y-auto`}
        >
          <div className="p-1.5">
            {PROVIDER_GROUPS.map((group) => {
              if (group.models.length === 0) return null
              return (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.models.map((model) => {
                    const isSelected = currentModelId === model.id
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelect(model.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'text-blue-600 bg-blue-50/80 font-medium'
                            : 'text-neutral-700 hover:bg-neutral-100/80'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{model.name}</span>
                          {model.thinking && <span title="Reasoning / Thinking model" className="text-[11px]">💭</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                          <span className="text-neutral-400 capitalize">{model.intelligence}</span>
                          <span className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono text-[10px] capitalize">
                            {model.speed}
                          </span>
                          {isSelected && <span className="text-blue-600 font-bold ml-0.5">✓</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

