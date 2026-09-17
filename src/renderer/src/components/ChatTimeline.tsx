import React, { useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Copy
} from 'lucide-react'
import { ChatMessage } from '@shared/types'
import { StreamingText } from './StreamingText'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ActionStepRow } from './ActionStepRow'
import { normalizeMessageBlocks } from '../utils/chatReducer'

interface ChatTimelineProps {
  messages: ChatMessage[]
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({ messages }) => {
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-4 space-y-6">
      {messages.map((msg) => {
        const blocks = normalizeMessageBlocks(msg)

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

            {/* Assistant Message - Sequential Interleaved Stream */}
            {msg.role === 'assistant' && (
              <div className="space-y-2">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1 font-normal select-none mb-1">
                  <span>Response</span>
                  <ChevronRight className="w-3 h-3 text-neutral-400" />
                </div>

                {/* Empty placeholder pulse during initial connection before first token */}
                {msg.isStreaming && blocks.length === 0 && (
                  <div className="flex items-center gap-2 py-2 text-neutral-400 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    <span>Agent 正在连接分析...</span>
                  </div>
                )}

                {/* Interleaved Blocks: Ordered stream of text, tools, and thinking */}
                {blocks.map((block, idx) => {
                  if (block.type === 'thinking') {
                    const isThinkingExpanded =
                      expandedThinking[block.id] !== undefined
                        ? expandedThinking[block.id]
                        : !!(msg.isStreaming && idx === blocks.length - 1)

                    return (
                      <div
                        key={block.id}
                        className="border border-neutral-200/90 bg-[#fbfbfb] rounded-xl overflow-hidden text-xs my-2 transition-all"
                      >
                        <div
                          onClick={() => toggleThinking(block.id)}
                          className="flex items-center justify-between px-3 py-2 bg-[#f8f9fa] hover:bg-neutral-100 cursor-pointer select-none text-neutral-600 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <Brain
                              className={`w-3.5 h-3.5 text-amber-500 ${
                                msg.isStreaming && idx === blocks.length - 1 ? 'animate-pulse' : ''
                              }`}
                            />
                            <span className="font-medium text-neutral-700 text-xs">
                              {msg.isStreaming && idx === blocks.length - 1
                                ? 'Agent 思考中 (Thinking)...'
                                : '思考过程 (Thought Process)'}
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
                              content={block.content || ''}
                              isStreaming={!!(msg.isStreaming && idx === blocks.length - 1)}
                            />
                          </div>
                        )}
                      </div>
                    )
                  }

                  if (block.type === 'tool') {
                    return (
                      <ActionStepRow
                        key={block.id}
                        toolCall={block.toolCall}
                        result={block.result}
                        status={block.status}
                      />
                    )
                  }

                  if (block.type === 'text') {
                    const isLastBlock = idx === blocks.length - 1
                    const isActivelyStreaming = isLastBlock && !!msg.isStreaming

                    return (
                      <div
                        key={block.id}
                        className="text-[14px] text-neutral-800 leading-relaxed py-0.5"
                      >
                        {isActivelyStreaming ? (
                          <StreamingText
                            content={block.content || ''}
                            isStreaming={true}
                          />
                        ) : (
                          <MarkdownRenderer
                            content={block.content || ''}
                            isStreaming={false}
                          />
                        )}
                      </div>
                    )
                  }

                  return null
                })}

                {/* Footer Feedback Actions */}
                {!msg.isStreaming && msg.content && (
                  <div className="flex items-center justify-end gap-1 pt-2 text-neutral-400 select-none">
                    <button
                      type="button"
                      className="p-1 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors"
                      title="Good response"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors"
                      title="Bad response"
                    >
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


