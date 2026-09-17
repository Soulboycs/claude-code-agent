import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import {
  AgentEvent,
  AgentStatus,
  ApprovalRequest,
  FileTreeNode
} from '@shared/types'
import { AntigravityTopBar } from './components/AntigravityTopBar'
import { Sidebar } from './components/Sidebar'
import { ChatTimeline } from './components/ChatTimeline'
import { ApprovalCard } from './components/ApprovalCard'
import { TerminalView } from './components/TerminalView'
import { SettingsModal } from './components/SettingsModal'
import { FloatingInputDock } from './components/FloatingInputDock'
import { Sparkles } from 'lucide-react'
import { createInitialChatState, chatReducer } from './utils/chatReducer'
import { createScrollFollower, ScrollFollower } from './utils/scrollFollower'

export default function App() {
  const [workspace, setWorkspace] = useState<string>('')
  const [, setFiles] = useState<FileTreeNode[]>([])

  const [status, setStatus] = useState<AgentStatus>('idle')
  const [, setStatusMessage] = useState<string>('')
  const [promptInput, setPromptInput] = useState<string>('')
  const [currentModelId, setCurrentModelId] = useState<string>('')

  // Projects & Navigation state (Matching Antigravity screenshot)
  const [currentProject, setCurrentProject] = useState<string>('Agent')
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string>('AI Agent Reference Projects')
  const [currentConversationId, setCurrentConversationId] = useState<string>('conv_1')
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

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

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollFollowerRef = useRef<ScrollFollower | null>(null)

  // Smart follow: input-source based
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
    try {
      const tree = await window.electronAPI?.readWorkspaceFiles?.(targetDir)
      if (tree) setFiles(tree)
    } catch (e) {
      console.error('Failed to refresh files:', e)
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
  useEffect(() => {
    scrollFollowerRef.current?.follow()
  }, [messages, pendingApproval])

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

  const handleScrollToBottom = () => {
    scrollFollowerRef.current?.forceFollow()
  }

  const handleAbort = async () => {
    try {
      await window.electronAPI?.abort?.()
      dispatchChat({ type: 'status_change', status: 'idle' })
    } catch (e) {
      console.error('Failed to abort:', e)
    }
  }

  const handleSelectConversation = (id: string, title: string, projectName: string) => {
    setCurrentConversationId(id)
    setCurrentConversationTitle(title)
    setCurrentProject(projectName)
  }

  const handleNewConversation = () => {
    dispatchChat({ type: 'status_change', status: 'idle' })
    setCurrentConversationId(`conv_${Date.now()}`)
    setCurrentConversationTitle('New Conversation')
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-neutral-900 font-sans select-text antialiased">
      {/* Top Application Menubar and Breadcrumbs (1:1 Antigravity) */}
      <AntigravityTopBar
        currentProject={currentProject}
        currentConversationTitle={currentConversationTitle}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Antigravity Projects & Conversations Sidebar */}
        {isSidebarOpen && (
          <Sidebar
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {/* Center Main Content Canvas */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
          {/* Scrollable Chat Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900 mb-1.5">
                  How can I help you code today?
                </h2>
                <p className="text-xs text-neutral-500 max-w-sm mb-6 leading-relaxed">
                  I can inspect and edit your codebase, execute commands, run tests, and architect systems autonomously.
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full text-left">
                  {[
                    'Explain the project architecture',
                    'Write an automated test suite',
                    'Refactor utilities for error resilience',
                    'Scan for security vulnerabilities'
                  ].map((tip) => (
                    <button
                      key={tip}
                      type="button"
                      onClick={() => setPromptInput(tip)}
                      className="p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 text-xs text-neutral-700 hover:text-neutral-900 transition-all text-left truncate shadow-2xs"
                    >
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Unified Chat Timeline */}
            <ChatTimeline messages={messages} />

            {/* Human-in-the-loop Approval Card */}
            {pendingApproval && (
              <div className="max-w-4xl mx-auto px-6 pb-4">
                <ApprovalCard request={pendingApproval} onRespond={handleApprovalRespond} />
              </div>
            )}
          </div>

          {/* Bottom Floating Input Dock (1:1 Antigravity) */}
          <FloatingInputDock
            promptInput={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onSend={handleSendMessage}
            onAbort={handleAbort}
            onScrollToBottom={handleScrollToBottom}
            currentModelId={currentModelId}
            onModelChange={(id) => setCurrentModelId(id)}
            status={status}
          />

          {/* Bottom Embedded Terminal Drawer */}
          <TerminalView isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}
