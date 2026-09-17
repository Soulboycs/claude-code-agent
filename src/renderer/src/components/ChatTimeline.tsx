import React, { useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wrench
} from 'lucide-react'
import { ChatMessage, ToolCallPayload, ToolResultPayload } from '@shared/types'

interface ChatTimelineProps {
  messages: ChatMessage[]
  activeThinking?: string
  activeToolCalls?: ToolCallPayload[]
  activeToolResults?: Record<string, ToolResultPayload>
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({
  messages,
  activeThinking,
  activeToolCalls = [],
  activeToolResults = {}
}) => {
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({
    active: true
  })
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {messages.map((msg) => (
        <div key={msg.id} className="space-y-3">
          {/* User Message */}
          {msg.role === 'user' && (
            <div className="flex justify-end">
              <div className="max-w-2xl bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm shadow-md whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>
            </div>
          )}

          {/* Assistant Message */}
          {msg.role === 'assistant' && (
            <div className="space-y-3">
              {/* Thinking block if present */}
              {msg.thinking && (
                <div className="border border-neutral-800 bg-[#16171c] rounded-lg overflow-hidden text-xs">
                  <div
                    onClick={() => toggleThinking(msg.id)}
                    className="flex items-center justify-between px-3 py-2 bg-[#1a1b22] hover:bg-[#20212b] cursor-pointer select-none text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-semibold text-neutral-300">Thought Process</span>
                    </div>
                    {expandedThinking[msg.id] ? (
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                  </div>
                  {expandedThinking[msg.id] && (
                    <div className="p-3 text-neutral-400 font-mono text-[11px] whitespace-pre-wrap leading-relaxed border-t border-neutral-800/60 bg-[#121316]">
                      {msg.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Historical Tool Calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="space-y-2">
                  {msg.toolCalls.map((tc) => {
                    const result = msg.toolResults?.find((r) => r.toolCallId === tc.id)
                    const isExpanded = !!expandedTools[tc.id]
                    return (
                      <div
                        key={tc.id}
                        className="border border-neutral-800 bg-[#16171b] rounded-lg overflow-hidden text-xs"
                      >
                        <div
                          onClick={() => toggleTool(tc.id)}
                          className="flex items-center justify-between px-3 py-2 hover:bg-[#1e1f26] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Wrench className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono font-medium text-neutral-200">{tc.name}</span>
                            {result && !result.isError && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {result && result.isError && (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="p-3 border-t border-neutral-800 bg-[#121316] space-y-2">
                            <div>
                              <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1">Arguments:</div>
                              <pre className="text-neutral-300 font-mono text-[11px] bg-black/40 p-2 rounded overflow-x-auto">
                                {JSON.stringify(tc.arguments, null, 2)}
                              </pre>
                            </div>
                            {result && (
                              <div>
                                <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1">Result:</div>
                                <pre
                                  className={`font-mono text-[11px] p-2 rounded overflow-x-auto ${
                                    result.isError
                                      ? 'text-rose-400 bg-rose-950/20 border border-rose-900/40'
                                      : 'text-neutral-300 bg-black/40'
                                  }`}
                                >
                                  {result.isError ? result.error : result.output}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Message Content */}
              {msg.content && (
                <div className="bg-[#18191f] border border-[#262833] rounded-2xl rounded-tl-sm p-4 text-sm text-neutral-200 shadow-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Active Streaming Thinking */}
      {activeThinking && (
        <div className="border border-amber-500/20 bg-[#171615] rounded-lg overflow-hidden text-xs animate-in fade-in">
          <div
            onClick={() => toggleThinking('active')}
            className="flex items-center justify-between px-3 py-2 bg-[#1f1d19] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="font-semibold text-amber-300">Agent Thinking...</span>
            </div>
            {expandedThinking.active ? (
              <ChevronDown className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
            )}
          </div>
          {expandedThinking.active && (
            <div className="p-3 text-amber-200/80 font-mono text-[11px] whitespace-pre-wrap leading-relaxed border-t border-amber-500/10 bg-[#121110]">
              {activeThinking}
            </div>
          )}
        </div>
      )}

      {/* Active Running Tool Calls */}
      {activeToolCalls.map((tc) => {
        const result = activeToolResults[tc.id]
        const isExpanded = !!expandedTools[tc.id]
        return (
          <div
            key={tc.id}
            className="border border-blue-500/30 bg-[#141722] rounded-lg overflow-hidden text-xs"
          >
            <div
              onClick={() => toggleTool(tc.id)}
              className="flex items-center justify-between px-3 py-2 bg-[#181d2c] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {!result ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                ) : result.isError ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="font-mono font-medium text-blue-200">{tc.name}</span>
                <span className="text-[10px] text-neutral-400">
                  {!result ? 'Executing...' : result.isError ? 'Failed' : 'Success'}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              )}
            </div>

            {isExpanded && (
              <div className="p-3 border-t border-blue-500/20 bg-[#10121a] space-y-2">
                <pre className="text-neutral-300 font-mono text-[11px] bg-black/40 p-2 rounded overflow-x-auto">
                  {JSON.stringify(tc.arguments, null, 2)}
                </pre>
                {result && (
                  <pre
                    className={`font-mono text-[11px] p-2 rounded overflow-x-auto ${
                      result.isError
                        ? 'text-rose-400 bg-rose-950/20 border border-rose-900/40'
                        : 'text-neutral-300 bg-black/40'
                    }`}
                  >
                    {result.isError ? result.error : result.output}
                  </pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
