import React, { useState, useEffect, useRef } from 'react'
import {
  AgentEvent,
  AgentStatus,
  ApprovalRequest,
  ChatMessage,
  FileTreeNode,
  ToolCallPayload,
  ToolResultPayload
} from '@shared/types'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ChatTimeline } from './components/ChatTimeline'
import { ApprovalCard } from './components/ApprovalCard'
import { TerminalView } from './components/TerminalView'
import { SettingsModal } from './components/SettingsModal'
import { Send, CornerDownLeft, Sparkles } from 'lucide-react'

export default function App() {
  const [workspace, setWorkspace] = useState<string>('')
  const [files, setFiles] = useState<FileTreeNode[]>([])
  const [isFilesLoading, setIsFilesLoading] = useState<boolean>(false)

  const [status, setStatus] = useState<AgentStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [promptInput, setPromptInput] = useState<string>('')

  // Active streaming state
  const [activeThinking, setActiveThinking] = useState<string>('')
  const [activeMessageDelta, setActiveMessageDelta] = useState<string>('')
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallPayload[]>([])
  const [activeToolResults, setActiveToolResults] = useState<Record<string, ToolResultPayload>>({})

  // Human-in-the-Loop pending approval
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)

  // Layout toggles
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load files on workspace change
  const refreshFiles = async (dir?: string) => {
    const targetDir = dir || workspace
    if (!targetDir) return
    setIsFilesLoading(true)
    try {
      const tree = await window.electronAPI?.readWorkspaceFiles?.(targetDir)
      if (tree) setFiles(tree)
    } finally {
      setIsFilesLoading(false)
    }
  }

  const [currentModelId, setCurrentModelId] = useState<string>('')

  // Subscribe to Agent events
  useEffect(() => {
    // Initial workspace selection
    window.electronAPI?.selectWorkspaceFolder?.().then((folder) => {
      if (folder) {
        setWorkspace(folder)
        refreshFiles(folder)
      }
    })

    window.electronAPI?.getProviderConfig?.().then((config) => {
      if (config && config.model) {
        setCurrentModelId(config.model)
      }
    })

    const unsubscribe = window.electronAPI?.onAgentEvent?.((event: AgentEvent) => {
      switch (event.type) {
        case 'status_change':
          setStatus(event.status)
          if (event.message) setStatusMessage(event.message)
          if (event.status === 'completed' || event.status === 'error' || event.status === 'idle') {
            // Commit active streaming content into messages
            setActiveMessageDelta((prevContent) => {
              if (prevContent.trim() || activeThinking.trim()) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `asst_${Date.now()}`,
                    role: 'assistant',
                    content: prevContent,
                    thinking: activeThinking || undefined,
                    toolCalls: activeToolCalls,
                    toolResults: Object.values(activeToolResults),
                    timestamp: Date.now()
                  }
                ])
              }
              return ''
            })
            setActiveThinking('')
            setActiveToolCalls([])
            setActiveToolResults({})
            setPendingApproval(null)
            refreshFiles()
          }
          break

        case 'thinking_delta':
          setActiveThinking((prev) => prev + event.delta)
          break

        case 'message_delta':
          setActiveMessageDelta((prev) => prev + event.delta)
          break

        case 'tool_call_start':
          setActiveToolCalls((prev) => [...prev, event.toolCall])
          break

        case 'tool_call_complete':
          setActiveToolResults((prev) => ({
            ...prev,
            [event.result.toolCallId]: event.result
          }))
          // Automatically refresh files if file modification took place
          if (
            event.result.name.includes('file') ||
            event.result.name === 'run_command'
          ) {
            refreshFiles()
          }
          break

        case 'approval_required':
          setPendingApproval(event.request)
          break

        case 'terminal_output':
          // Auto open terminal if agent executes commands
          setIsTerminalOpen(true)
          break

        case 'error':
          setStatus('error')
          setStatusMessage(event.message)
          break
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [workspace, activeThinking, activeToolCalls, activeToolResults])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeThinking, activeMessageDelta, activeToolCalls, pendingApproval])

  const handleSelectWorkspace = async () => {
    const chosen = await window.electronAPI?.selectWorkspaceFolder?.()
    if (chosen) {
      setWorkspace(chosen)
      refreshFiles(chosen)
    }
  }

  const handleSendMessage = async () => {
    const prompt = promptInput.trim()
    if (!prompt || status === 'thinking' || status === 'tool_executing') return

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now()
      }
    ])
    setPromptInput('')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    await window.electronAPI?.sendMessage?.(prompt, workspace)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleApprovalRespond = async (approved: boolean, reason?: string) => {
    if (!pendingApproval) return
    const id = pendingApproval.id
    setPendingApproval(null)
    await window.electronAPI?.respondApproval?.(id, approved, reason)
  }

  const handleAbort = async () => {
    await window.electronAPI?.abortAgent?.()
  }

  // Auto resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#121316] text-[#f3f4f6]">
      {/* Top Header */}
      <Header
        workspace={workspace}
        status={status}
        statusMessage={statusMessage}
        currentModelId={currentModelId}
        onModelChange={(id) => setCurrentModelId(id)}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onAbort={handleAbort}
        onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        isTerminalOpen={isTerminalOpen}
      />

      {/* Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left File Tree Sidebar */}
        <Sidebar
          files={files}
          isLoading={isFilesLoading}
          onRefresh={() => refreshFiles()}
        />

        {/* Center Chat & Agent Timeline */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#121316]">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 && !activeThinking && !activeMessageDelta && (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-inner">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-base font-semibold text-neutral-100 mb-1">
                  How can I help you code today?
                </h2>
                <p className="text-xs text-neutral-400 max-w-sm mb-6">
                  I can read and edit your code, execute shell commands, run test suites, and build features autonomously.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full text-left">
                  {[
                    'Explain the project architecture',
                    'Write a test suite for the main API',
                    'Refactor file utilities for error resilience',
                    'Scan for security issues and dependencies'
                  ].map((tip) => (
                    <button
                      key={tip}
                      onClick={() => setPromptInput(tip)}
                      className="p-2.5 rounded-lg bg-[#181921] hover:bg-[#20222d] border border-[#262836] text-xs text-neutral-300 hover:text-white transition-all text-left truncate"
                    >
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <ChatTimeline
              messages={messages}
              activeThinking={activeThinking}
              activeToolCalls={activeToolCalls}
              activeToolResults={activeToolResults}
            />

            {/* Active message delta stream preview */}
            {activeMessageDelta && (
              <div className="px-6 pb-6">
                <div className="bg-[#18191f] border border-[#262833] rounded-2xl rounded-tl-sm p-4 text-sm text-neutral-200 shadow-sm leading-relaxed whitespace-pre-wrap">
                  {activeMessageDelta}
                  <span className="inline-block w-1.5 h-4 bg-blue-400 ml-1 animate-pulse" />
                </div>
              </div>
            )}

            {/* Human-in-the-loop Approval Card */}
            {pendingApproval && (
              <div className="px-6">
                <ApprovalCard request={pendingApproval} onRespond={handleApprovalRespond} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Bottom Embedded Terminal */}
          <TerminalView isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

          {/* Bottom Chat Input Prompt Box */}
          <div className="p-4 bg-[#14151b] border-t border-[#22232a]">
            <div className="relative rounded-xl bg-[#1a1b22] border border-[#2b2d38] focus-within:border-blue-500/80 transition-all shadow-lg">
              <textarea
                ref={textareaRef}
                value={promptInput}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask the Agent to write code, debug issues, or execute commands... (Enter to send, Shift+Enter for newline)"
                className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none resize-none max-h-44"
              />

              <div className="h-10 px-3 flex items-center justify-between border-t border-[#24252f] text-xs text-neutral-400">
                <span className="text-[11px] text-neutral-500 font-mono">
                  {workspace ? `Workspace: ${workspace.split(/[\\/]/).pop()}` : 'No workspace selected'}
                </span>

                <button
                  onClick={handleSendMessage}
                  disabled={!promptInput.trim() || status === 'thinking' || status === 'tool_executing'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-medium text-xs shadow transition-colors"
                >
                  <span>Send</span>
                  <CornerDownLeft className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}
