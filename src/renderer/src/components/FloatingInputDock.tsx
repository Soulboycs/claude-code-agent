import React, { useRef, useEffect } from 'react'
import { Plus, ArrowDown, ArrowUp, Square } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { AgentStatus } from '@shared/types'

interface FloatingInputDockProps {
  promptInput: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onAbort?: () => void
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
  onAbort,
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
    <div className="w-full max-w-3xl mx-auto px-6 pb-4 shrink-0 pointer-events-auto">
      <div className="relative rounded-2xl bg-white border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-3 flex flex-col gap-1.5 transition-all focus-within:border-neutral-300">
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

        {/* Bottom Actions Bar (Seamless with no horizontal divider line) */}
        <div className="flex items-center justify-between text-xs pt-0.5">
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

          {/* Right Action Buttons: Scroll to bottom & Send / Abort */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onScrollToBottom}
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            {isBusy ? (
              <button
                type="button"
                onClick={onAbort}
                className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200/90 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition-all shadow-xs"
                title="Stop generation"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  canSend
                    ? 'bg-neutral-900 hover:bg-black text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                }`}
                title="Send message"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FloatingInputDock
