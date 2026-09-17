import React, { useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy
} from 'lucide-react'
import { ChatMessage } from '@shared/types'
import { StreamingText } from './StreamingText'

function getToolLabel(name: string, args: any, isRunning: boolean) {
  const path = args?.filePath || args?.path || args?.AbsolutePath || ''
  const filename = path ? String(path).split(/[/\\]/).pop() : ''
  const isTs = filename ? filename.endsWith('.ts') || filename.endsWith('.tsx') : false

  if (name === 'view_file') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-600">
        <span>{isRunning ? 'Exploring file' : 'Analyzed'}</span>
        {filename && (
          <span className="flex items-center gap-1">
            {isTs && <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1 py-0.2 rounded font-mono">TS</span>}
            <span className="font-mono text-neutral-800 text-[11px]">{filename}</span>
          </span>
        )}
      </div>
    )
  }
  if (name === 'replace_file_content' || name === 'write_to_file') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-600">
        <span>Edited</span>
        {filename && (
          <span className="flex items-center gap-1">
            {isTs && <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1 py-0.2 rounded font-mono">TS</span>}
            <span className="font-mono text-neutral-800 text-[11px]">{filename}</span>
            <span className="text-emerald-600 font-mono text-[10px] font-medium">+1</span>
            <span className="text-rose-500 font-mono text-[10px] font-medium">-1</span>
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-600">
      <span className="font-mono font-medium text-neutral-800 text-[11px]">{name}</span>
    </div>
  )
}

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
    <div className="w-full max-w-4xl mx-auto px-6 py-4 space-y-6">
      {messages.map((msg) => {
        // Auto-expand thinking while actively streaming thinking
        const isThinkingExpanded =
          expandedThinking[msg.id] !== undefined
            ? expandedThinking[msg.id]
            : !!(msg.isStreaming && msg.thinking && !msg.content)

        return (
          <div key={msg.id} className="space-y-4">
            {/* User Request Card - 1:1 matching Antigravity light card */}
            {msg.role === 'user' && (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)] text-neutral-900 transition-all">
                <div className="text-sm font-normal text-neutral-800 leading-relaxed select-text">
                  {msg.content}
                </div>
              </div>
            )}

            {/* Assistant Message - Clean White Canvas Typography */}
            {msg.role === 'assistant' && (
              <div className="space-y-2.5">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1 font-normal select-none">
                  <span>Response</span>
                  <ChevronRight className="w-3 h-3 text-neutral-400" />
                </div>

                {/* Thinking block if present */}
                {msg.thinking && (
                  <div className="border border-neutral-200/90 bg-[#fbfbfb] rounded-lg overflow-hidden text-xs">
                    <div
                      onClick={() => toggleThinking(msg.id)}
                      className="flex items-center justify-between px-3 py-2 bg-[#f8f9fa] hover:bg-neutral-100 cursor-pointer select-none text-neutral-600 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <Brain
                          className={`w-3.5 h-3.5 text-amber-500 ${
                            msg.isStreaming && !msg.content ? 'animate-pulse' : ''
                          }`}
                        />
                        <span className="font-medium text-neutral-700 text-xs">
                          {msg.isStreaming && !msg.content ? 'Agent Thinking...' : 'Thought Process'}
                        </span>
                      </div>
                      {isThinkingExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                      )}
                    </div>
                    {isThinkingExpanded && (
                      <div className="p-3 text-neutral-600 font-mono text-[11px] whitespace-pre-wrap leading-relaxed border-t border-neutral-200/70 bg-white">
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
                          className="border border-neutral-200/90 bg-[#fafafa] rounded-lg overflow-hidden text-xs"
                        >
                          <div
                            onClick={() => toggleTool(tc.id)}
                            className="flex items-center justify-between px-3 py-2 hover:bg-neutral-100/80 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                              ) : result && result.isError ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              {getToolLabel(tc.name, tc.arguments, !!isRunning)}
                            </div>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                            )}
                          </div>

                          {isExpanded && (
                            <div className="p-3 border-t border-neutral-200 bg-white space-y-2">
                              <div>
                                <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1">
                                  Arguments:
                                </div>
                                <pre className="text-neutral-700 font-mono text-[11px] bg-neutral-50 border border-neutral-200 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(tc.arguments, null, 2)}
                                </pre>
                              </div>

                              {(tc.name === 'write_to_file' || tc.name === 'replace_file_content') && (
                                <div className="mt-2">
                                  <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1">
                                    {tc.name === 'write_to_file' ? 'File Content Preview' : 'Diff Preview'} (
                                    {String((tc.arguments as any)?.filePath || (tc.arguments as any)?.path || '')}
                                    ):
                                  </div>
                                  {tc.name === 'write_to_file' ? (
                                    <pre className="text-neutral-700 font-mono text-[11px] bg-neutral-50 border border-neutral-200 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                      {String((tc.arguments as any)?.content || '')}
                                    </pre>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <pre className="text-rose-600 bg-rose-50 border border-rose-200 font-mono text-[11px] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                        - {String((tc.arguments as any)?.targetContent || '')}
                                      </pre>
                                      <pre className="text-emerald-600 bg-emerald-50 border border-emerald-200 font-mono text-[11px] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                        + {String((tc.arguments as any)?.replacementContent || '')}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}

                              {result && (
                                <div>
                                  <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1">
                                    Result:
                                  </div>
                                  <pre
                                    className={`font-mono text-[11px] p-2 rounded overflow-x-auto ${
                                      result.isError
                                        ? 'text-rose-600 bg-rose-50 border border-rose-200'
                                        : 'text-neutral-700 bg-neutral-50 border border-neutral-200'
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

                {/* Message Content with in-place smooth typewriter streaming and rich Markdown on White Canvas */}
                {(msg.content || (msg.isStreaming && !msg.thinking && (!msg.toolCalls || msg.toolCalls.length === 0))) && (
                  <div className="text-sm text-neutral-800 leading-relaxed py-1">
                    <StreamingText
                      content={msg.content || ''}
                      isStreaming={!!msg.isStreaming}
                    />
                  </div>
                )}

                {/* Footer Feedback Actions (1:1 with Antigravity) */}
                {!msg.isStreaming && msg.content && (
                  <div className="flex items-center justify-end gap-1 pt-1 text-neutral-400 select-none">
                    <button type="button" className="p-1 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors" title="Good response">
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="p-1 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors" title="Bad response">
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      className="p-1 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors"
                      title="Copy message"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
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

