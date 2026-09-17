import React from 'react'
import { PanelLeft, ChevronLeft, ChevronRight, Triangle } from 'lucide-react'

interface AntigravityTopBarProps {
  currentProject?: string
  currentConversationTitle?: string
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
}

export const AntigravityTopBar: React.FC<AntigravityTopBarProps> = ({
  currentProject = 'Agent',
  currentConversationTitle = 'AI Agent Reference Projects',
  onToggleSidebar,
  isSidebarOpen = true
}) => {
  return (
    <header className="flex flex-col bg-white select-none border-b border-neutral-200/70">
      {/* Top Application Desktop Menubar */}
      <div className="flex items-center justify-between px-3 h-7 text-[12px] text-neutral-600 border-b border-neutral-100 bg-[#fcfcfd]">
        <div className="flex items-center gap-4">
          <span className="font-medium text-neutral-800 cursor-default hover:text-black transition-colors">
            Antigravity
          </span>
          <span className="cursor-default hover:text-neutral-900 transition-colors">File</span>
          <span className="cursor-default hover:text-neutral-900 transition-colors">View</span>
          <span className="cursor-default hover:text-neutral-900 transition-colors">Window</span>
        </div>
      </div>

      {/* Navigation and Breadcrumbs Bar */}
      <div className="flex items-center h-10 px-3 gap-3">
        {/* Left Control Group (Aligned with Sidebar) */}
        <div className="flex items-center gap-1 w-56 shrink-0">
          <div className="w-6 h-6 flex items-center justify-center text-black mr-1" title="Antigravity">
            <Triangle className="w-3.5 h-3.5 fill-black rotate-180" />
          </div>

          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-1.5 rounded hover:bg-neutral-100 text-neutral-600 transition-colors ${
              !isSidebarOpen ? 'bg-neutral-100' : ''
            }`}
            title="Toggle Sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-30"
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-30"
            title="Forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Breadcrumbs Bar (Aligned with Main Canvas) */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 pl-2">
          <span className="hover:text-neutral-800 cursor-pointer transition-colors font-medium">
            {currentProject}
          </span>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-800 font-semibold truncate max-w-md">
            {currentConversationTitle}
          </span>
        </div>
      </div>
    </header>
  )
}

export default AntigravityTopBar
