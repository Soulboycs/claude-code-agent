import React, { useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { ChatMessage } from '@shared/types'
import { StreamingText } from './StreamingText'

interface ChatTimelineProps {
  messages: ChatMessage[]
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({ messages }) => {
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {messages.map((msg) => {
        // Auto-expand thinking while actively streaming thinking
        const isThinkingExpanded =
          expandedThinking[msg.id] !== undefined
            ? expandedThinking[msg.id]
            : !!(msg.isStreaming && msg.thinking && !msg.content)

        return (
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
                        <Brain
                          className={`w-3.5 h-3.5 text-amber-400 ${
                            msg.isStreaming && !msg.content ? 'animate-pulse' : ''
                          }`}
                        />
                        <span className="font-semibold text-neutral-300">
                          {msg.isStreaming && !msg.content ? 'Agent Thinking...' : 'Thought Process'}
                        </span>
                      </div>
                      {isThinkingExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                      )}
                    </div>
                    {isThinkingExpanded && (
                      <div className="p-3 text-neutral-400 font-mono text-[11px] whitespace-pre-wrap leading-relaxed border-t border-neutral-800/60 bg-[#121316]">
                        <StreamingText
                          content={msg.thinking || ''}
                          isStreaming={!!(msg.isStreaming && !msg.content)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tool Calls in this turn */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    {msg.toolCalls.map((tc) => {
                      const result = msg.toolResults?.find((r) => r.toolCallId === tc.id)
                      const isExpanded = !!expandedTools[tc.id]
                      const isRunning = !result && msg.isStreaming

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
                              {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                              ) : result && result.isError ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              <span className="font-mono font-medium text-neutral-200">{tc.name}</span>
                              <span className="text-[10px] text-neutral-500">
                                {isRunning ? 'Executing...' : result?.isError ? 'Failed' : 'Completed'}
                              </span>
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
                                <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1">
                                  Arguments:
                                </div>
                                <pre className="text-neutral-300 font-mono text-[11px] bg-black/40 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(tc.arguments, null, 2)}
                                </pre>
                              </div>

                              {(tc.name === 'write_to_file' || tc.name === 'replace_file_content') && (
                                <div className="mt-2">
                                  <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1">
                                    {tc.name === 'write_to_file' ? 'File Content Preview' : 'Diff Preview'} (
                                    {String((tc.arguments as any)?.filePath || (tc.arguments as any)?.path || '')}
                                    ):
                                  </div>
                                  {tc.name === 'write_to_file' ? (
                                    <pre className="text-neutral-300 font-mono text-[11px] bg-black/40 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                      {String((tc.arguments as any)?.content || '')}
                                    </pre>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <pre className="text-rose-400 bg-rose-950/20 font-mono text-[11px] p-2 rounded overflow-x-auto whitespace-pre-wrap opacity-80">
                                        - {String((tc.arguments as any)?.targetContent || '')}
                                      </pre>
                                      <pre className="text-emerald-400 bg-emerald-950/20 font-mono text-[11px] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                        + {String((tc.arguments as any)?.replacementContent || '')}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}

                              {result && (
                                <div>
                                  <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1">
                                    Result:
                                  </div>
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

                {/* Message Content with in-place smooth typewriter streaming and rich Markdown */}
                {(msg.content || (msg.isStreaming && !msg.thinking && (!msg.toolCalls || msg.toolCalls.length === 0))) && (
                  <div className="bg-[#18191f] border border-[#262833] rounded-2xl rounded-tl-sm p-4 text-sm text-neutral-200 shadow-sm leading-relaxed break-words">
                    <StreamingText
                      content={msg.content || ''}
                      isStreaming={!!msg.isStreaming}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
