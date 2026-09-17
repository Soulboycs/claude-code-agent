import React, { useState } from 'react'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import { FileTreeNode } from '@shared/types'

interface SidebarProps {
  files: FileTreeNode[]
  isLoading: boolean
  onRefresh: () => void
  onFileSelect?: (file: FileTreeNode) => void
}

const FileItem: React.FC<{
  node: FileTreeNode
  depth: number
  onFileSelect?: (file: FileTreeNode) => void
}> = ({ node, depth, onFileSelect }) => {
  const [isOpen, setIsOpen] = useState(false)

  if (node.isDirectory) {
    return (
      <div>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#222329] text-neutral-300 hover:text-white rounded cursor-pointer text-xs select-none transition-colors"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-blue-400/80 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <FileItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={() => onFileSelect?.(node)}
      className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#222329] text-neutral-400 hover:text-neutral-200 rounded cursor-pointer text-xs select-none transition-colors"
      style={{ paddingLeft: `${depth * 14 + 20}px` }}
    >
      <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
      <span className="truncate">{node.name}</span>
    </div>
  )
}

export const Sidebar: React.FC<SidebarProps> = ({ files, isLoading, onRefresh, onFileSelect }) => {
  return (
    <aside className="w-64 bg-[#141519] border-r border-[#222329] flex flex-col h-full shrink-0">
      <div className="h-9 px-3 border-b border-[#222329] flex items-center justify-between text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        <span>Files</span>
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-[#222329] text-neutral-400 hover:text-white rounded transition-colors"
          title="Refresh Explorer"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1">
        {files.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-xs">
            {isLoading ? 'Loading workspace...' : 'No files found'}
          </div>
        ) : (
          files.map((file) => (
            <FileItem key={file.path} node={file} depth={0} onFileSelect={onFileSelect} />
          ))
        )}
      </div>
    </aside>
  )
}
