import React, { useState } from 'react'
import {
  Plus,
  Clock,
  CalendarClock,
  Filter,
  FolderPlus,
  Folder,
  FolderOpen,
  Settings
} from 'lucide-react'
import { FileTreeNode } from '@shared/types'

export interface ConversationItem {
  id: string
  title: string
  timeAgo: string
  projectId: string
}

export interface ProjectGroup {
  id: string
  name: string
  conversations: ConversationItem[]
  isExpanded?: boolean
}

interface SidebarProps {
  files?: FileTreeNode[]
  isLoading?: boolean
  onRefresh?: () => void
  onFileSelect?: (file: FileTreeNode) => void
  currentConversationId?: string
  onSelectConversation?: (id: string, title: string, projectName: string) => void
  onNewConversation?: () => void
  onOpenSettings?: () => void
}

const DEFAULT_PROJECTS: ProjectGroup[] = [
  {
    id: 'proj_agent',
    name: 'Agent',
    isExpanded: true,
    conversations: [
      {
        id: 'conv_1',
        title: 'AI Agent Reference Proj...',
        timeAgo: '7m',
        projectId: 'proj_agent'
      },
      {
        id: 'conv_2',
        title: 'Starting A Conversation',
        timeAgo: '8h',
        projectId: 'proj_agent'
      }
    ]
  },
  {
    id: 'proj_paseo',
    name: 'paseo',
    isExpanded: true,
    conversations: [
      {
        id: 'conv_3',
        title: '抓取 Paseo 代码',
        timeAgo: '11h',
        projectId: 'proj_paseo'
      }
    ]
  },
  {
    id: 'proj_claude',
    name: 'claude code',
    isExpanded: true,
    conversations: [
      {
        id: 'conv_4',
        title: 'Clone GitHub Repository',
        timeAgo: '12h',
        projectId: 'proj_claude'
      }
    ]
  },
  {
    id: 'proj_evidence',
    name: 'evidence driven en...',
    isExpanded: true,
    conversations: [
      {
        id: 'conv_5',
        title: 'Auto Execution Permissi...',
        timeAgo: '12h',
        projectId: 'proj_evidence'
      }
    ]
  },
  {
    id: 'proj_hopper',
    name: 'eager-hopper',
    isExpanded: true,
    conversations: [
      {
        id: 'conv_6',
        title: 'Bypass Antigravity Pro...',
        timeAgo: '12h',
        projectId: 'proj_hopper'
      }
    ]
  }
]

export const Sidebar: React.FC<SidebarProps> = ({
  currentConversationId = 'conv_1',
  onSelectConversation,
  onNewConversation,
  onOpenSettings
}) => {
  const [projects, setProjects] = useState<ProjectGroup[]>(DEFAULT_PROJECTS)
  const [activeTab, setActiveTab] = useState<'conversations' | 'history' | 'tasks'>('conversations')

  const toggleProject = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, isExpanded: !p.isExpanded } : p))
    )
  }

  return (
    <aside className="w-60 h-full bg-[#fbfbfb] border-r border-neutral-200/80 flex flex-col select-none text-xs text-neutral-700 shrink-0 font-sans">
      {/* Top Main Action Button: + New Conversation */}
      <div className="p-3 pb-2">
        <button
          type="button"
          onClick={onNewConversation}
          className="w-full flex items-center justify-start gap-2 px-3 py-2 bg-white hover:bg-neutral-50 border border-neutral-200/90 rounded-lg text-xs font-medium text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow transition-all"
        >
          <Plus className="w-3.5 h-3.5 text-neutral-500" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Top Navigation Shortcuts */}
      <div className="px-3 py-1 space-y-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors ${
            activeTab === 'history' ? 'bg-neutral-100 text-neutral-900 font-medium' : ''
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Conversation History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors ${
            activeTab === 'tasks' ? 'bg-neutral-100 text-neutral-900 font-medium' : ''
          }`}
        >
          <CalendarClock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Scheduled Tasks</span>
        </button>
      </div>

      {/* Projects Section Header */}
      <div className="mt-3 px-3.5 py-1 flex items-center justify-between text-neutral-400">
        <span className="text-[11px] font-semibold tracking-wider">Projects</span>
        <div className="flex items-center gap-1.5 text-neutral-400">
          <button type="button" className="hover:text-neutral-700 p-0.5" title="Filter">
            <Filter className="w-3 h-3" />
          </button>
          <button type="button" className="hover:text-neutral-700 p-0.5" title="New Project">
            <FolderPlus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Projects and Conversations Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {projects.map((project) => {
          const isExpanded = project.isExpanded !== false
          return (
            <div key={project.id} className="space-y-0.5">
              {/* Project Title Bar */}
              <div
                onClick={() => toggleProject(project.id)}
                className="flex items-center gap-1.5 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70 rounded-md cursor-pointer transition-colors"
              >
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                )}
                <span className="truncate font-medium text-[11px]">{project.name}</span>
              </div>

              {/* Conversations under project */}
              {isExpanded && (
                <div className="pl-4 space-y-0.5">
                  {project.conversations.map((conv) => {
                    const isSelected = currentConversationId === conv.id
                    return (
                      <div
                        key={conv.id}
                        onClick={() => onSelectConversation?.(conv.id, conv.title, project.name)}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[11px] ${
                          isSelected
                            ? 'bg-neutral-200/75 text-neutral-900 font-medium shadow-2xs'
                            : 'text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900'
                        }`}
                        title={conv.title}
                      >
                        <span className="truncate mr-2">{conv.title}</span>
                        {isSelected ? (
                          <span className="w-2.5 h-2.5 border border-neutral-500 border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
                        ) : (
                          <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                            {conv.timeAgo}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom Pinned: Settings Button */}
      <div className="p-3 bg-[#fbfbfb]">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md w-full transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-neutral-500" />
          <span className="font-medium text-[11px]">Settings</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
