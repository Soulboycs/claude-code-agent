import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import {
  AgentEvent,
  AgentStatus,
  ApprovalRequest,
  FileTreeNode
} from '@shared/types'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ChatTimeline } from './components/ChatTimeline'
import { ApprovalCard } from './components/ApprovalCard'
import { TerminalView } from './components/TerminalView'
import { SettingsModal } from './components/SettingsModal'
import { CornerDownLeft, Sparkles } from 'lucide-react'
import { createInitialChatState, chatReducer } from './utils/chatReducer'
import { createScrollFollower, ScrollFollower } from './utils/scrollFollower'

export default function App() {
  const [workspace, setWorkspace] = useState<string>('')
  const [files, setFiles] = useState<FileTreeNode[]>([])
  const [isFilesLoading, setIsFilesLoading] = useState<boolean>(false)

  const [status, setStatus] = useState<AgentStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [promptInput, setPromptInput] = useState<string>('')
  const [currentModelId, setCurrentModelId] = useState<string>('')

  // Single source of truth for chat messages & active turn via pure tested chatReducer
  const [chatState, dispatchChat] = useReducer(chatReducer, undefined, createInitialChatState)
  const messages = chatState.messages

  const workspaceRef = useRef<string>('')
  workspaceRef.current = workspace

  // Human-in-the-Loop pending approval
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)

  // Layout toggles
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollFollowerRef = useRef<ScrollFollower | null>(null)

  // Smart follow: input-source based (wheel-up / scrollbar drag / nav keys stop
  // following; returning to bottom resumes). Position heuristics never disable
  // following, so programmatic scrolls and streaming growth cannot be misread.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const follower = createScrollFollower(el)
    scrollFollowerRef.current = follower
    return () => {
      follower.detach()
      scrollFollowerRef.current = null
    }
  }, [])

  // Refresh workspace file tree
  const refreshFiles = useCallback(async (dir?: string) => {
    const targetDir = dir || workspaceRef.current
    if (!targetDir) return
    setIsFilesLoading(true)
    try {
      const tree = await window.electronAPI?.readWorkspaceFiles?.(targetDir)
      if (tree) setFiles(tree)
    } finally {
      setIsFilesLoading(false)
    }
  }, [])

  // Subscribe to Agent events once on mount — 100% idempotent & FIFO ordered
  useEffect(() => {
    // Non-intrusive initial workspace detection (NO popup dialog on launch!)
    window.electronAPI?.getCurrentWorkspace?.().then((folder) => {
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
      // 1. Dispatch event to pure chatReducer (guarantees in-place accumulation & zero duplicate cards)
      dispatchChat(event)

      // 2. Auxiliary side effects
      if (event.type === 'status_change') {
        setStatus(event.status)
        if (event.message) setStatusMessage(event.message)

        if (event.status === 'completed' || event.status === 'error' || event.status === 'idle') {
          setPendingApproval(null)
          refreshFiles()
        }
      } else if (event.type === 'tool_call_complete') {
        // Refresh file tree if filesystem modification occurred
        if (
          event.result.name.includes('file') ||
          event.result.name === 'run_command'
        ) {
          refreshFiles()
        }
      } else if (event.type === 'approval_required') {
        setPendingApproval(event.request)
      } else if (event.type === 'terminal_output') {
        setIsTerminalOpen(true)
      } else if (event.type === 'error') {
        setStatus('error')
        setStatusMessage(event.message)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [refreshFiles])

  // Smart Auto-scroll: follow stream growth with an instant bottom snap.
  // Direct scrollTop assignment (post-commit) — no smooth animation, so there
  // are no mid-flight scroll events to misinterpret as user scroll-up.
  useEffect(() => {
    scrollFollowerRef.current?.follow()
  }, [messages, pendingApproval])

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

    const now = Date.now()
    const asstMsgId = `asst_${now}`

    // Force stick to bottom on new message
    scrollFollowerRef.current?.forceFollow()

    // Dispatch turn initiation directly into chatReducer
    dispatchChat({
      type: 'start_turn',
      prompt,
      turnId: asstMsgId
    })

    setPromptInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      await window.electronAPI?.sendMessage?.(prompt, workspaceRef.current || undefined)
    } catch (err: any) {
      dispatchChat({
        type: 'error',
        message: err.message || 'Failed to send message'
      })
    }
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
    dispatchChat({ type: 'status_change', status: 'idle' })
    setStatus('idle')
  }

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
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 && (
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

            {/* Unified, Idempotent Chat Messages Timeline */}
            <ChatTimeline messages={messages} />

            {/* Human-in-the-loop Approval Card */}
            {pendingApproval && (
              <div className="px-6 pb-6">
                <ApprovalCard request={pendingApproval} onRespond={handleApprovalRespond} />
              </div>
            )}
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
