import React, { useRef, useEffect } from 'react'
import { Plus, ArrowDown, ArrowRight } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { AgentStatus } from '@shared/types'

interface FloatingInputDockProps {
  promptInput: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onScrollToBottom: () => void
  currentModelId: string
  onModelChange: (modelId: string) => void
  status: AgentStatus
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  promptInput,
  onChange,
  onKeyDown,
  onSend,
  onScrollToBottom,
  currentModelId,
  onModelChange,
  status
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = status === 'thinking' || status === 'tool_executing'
  const canSend = promptInput.trim().length > 0 && !isBusy

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [promptInput])

  return (
    <div className="w-full max-w-4xl mx-auto px-6 pb-4 shrink-0 pointer-events-auto">
      <div className="relative rounded-2xl bg-white border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-2 transition-all focus-within:border-neutral-300">
        {/* Multi-line Textarea Input */}
        <textarea
          ref={textareaRef}
          value={promptInput}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask anything, @ to mention, / for actions"
          className="w-full bg-transparent px-1 py-0.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none max-h-40 leading-relaxed font-sans"
        />

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-xs">
          {/* Left Action Buttons: + Attachment & Model Capsule */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
              title="Add attachment or action"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Inlined Model Selector Capsule with Dropup */}
            <ModelSelector
              currentModelId={currentModelId}
              onModelChange={onModelChange}
              dropDirection="up"
            />
          </div>

          {/* Right Action Buttons: Scroll to bottom & Send */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onScrollToBottom}
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                canSend
                  ? 'bg-neutral-900 hover:bg-black text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
              }`}
              title="Send message"
            >
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FloatingInputDock
