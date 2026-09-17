import React, { useState } from 'react'
import {
  Loader2,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react'
import { ToolCallPayload, ToolResultPayload } from '@shared/types'

export const DcBadge: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <span
    className={`inline-flex items-center justify-center bg-[#18181b] text-white rounded-[3px] text-[8.5px] font-black tracking-tight select-none shrink-0 ${className}`}
    style={{ lineHeight: 1 }}
  >
    DC
  </span>
)

export function resolveActionTitle(name: string, args: any): string {
  // 1. Explicit model intention
  if (args?.toolAction && typeof args.toolAction === 'string' && args.toolAction.trim()) {
    return args.toolAction.replace(/^[▲⚡🐙\s]+/, '').trim()
  }
  if (args?.toolSummary && typeof args.toolSummary === 'string' && args.toolSummary.trim()) {
    return args.toolSummary.trim()
  }

  const rawPath = args?.filePath || args?.path || args?.AbsolutePath || ''
  const filename = rawPath ? String(rawPath).split(/[/\\]/).pop() : ''

  if (name === 'view_file') {
    return filename ? `查看文件 ${filename}` : '查看代码文件'
  }
  if (name === 'replace_file_content') {
    return filename ? `修改文件 ${filename}` : '修改代码实现'
  }
  if (name === 'write_to_file') {
    return filename ? `写入文件 ${filename}` : '创建或更新文件'
  }
  if (name === 'run_command') {
    const cmd = args?.command || args?.CommandLine || ''
    return cmd ? `执行命令: ${cmd}` : '执行终端命令'
  }
  if (name === 'grep_search') {
    const query = args?.query || args?.Query || ''
    return query ? `检索代码: ${query}` : '搜索代码内容'
  }
  if (name === 'find_by_name' || name === 'glob_find') {
    const pattern = args?.pattern || args?.Pattern || ''
    return pattern ? `查找文件: ${pattern}` : '定位文件'
  }
  if (name === 'list_directory') {
    return filename ? `浏览目录 ${filename}` : '查看目录结构'
  }
  return `执行操作: ${name}`
}

function resolveCategoryIcon(name: string, args: any, status: 'running' | 'completed' | 'error') {
  if (status === 'running') {
    return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
  }
  if (status === 'error') {
    return <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
  }

  const actionText = (args?.toolAction || '').trim()

  // 1. Green/Emerald Lightning (⚡): explicitly for final fixes, verification, or zap actions
  if (
    actionText.startsWith('⚡') ||
    actionText.includes('排查跨账户') ||
    actionText.includes('执行') ||
    (actionText.includes('修复') && name === 'replace_file_content')
  ) {
    return <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500 shrink-0" />
  }

  // 2. Triangle (▲): sub-investigation steps
  if (
    actionText.startsWith('▲') ||
    actionText.includes('会话加载器') ||
    actionText.includes('超时及数据库') ||
    actionText.includes('配置')
  ) {
    return <span className="text-[10px] text-neutral-800 font-bold shrink-0 select-none">▲</span>
  }

  // 3. GitHub (🐙): code search / postgres / repo files
  if (
    actionText.startsWith('Github') ||
    actionText.startsWith('🐙') ||
    actionText.includes('PostgreSQL') ||
    name === 'grep_search' ||
    name === 'find_by_name'
  ) {
    return (
      <svg className="w-3.5 h-3.5 text-neutral-800 shrink-0 fill-current select-none" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    )
  }

  // 4. Default: DC Badge (Data/Code/Session checks matching screenshots)
  return <DcBadge />
}

export interface ActionStepRowProps {
  toolCall: ToolCallPayload
  result?: ToolResultPayload
  status?: 'running' | 'completed' | 'error'
  className?: string
}

export const ActionStepRow: React.FC<ActionStepRowProps> = ({
  toolCall,
  result,
  status = 'completed',
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const title = resolveActionTitle(toolCall.name, toolCall.arguments)
  const icon = resolveCategoryIcon(toolCall.name, toolCall.arguments, status)

  const handleCopyResult = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const contentToCopy = result?.isError
      ? result?.error || ''
      : result?.output || JSON.stringify(toolCall.arguments, null, 2)
    try {
      await navigator.clipboard.writeText(contentToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy action result:', err)
    }
  }

  return (
    <div className={`my-1.5 group select-none ${className}`}>
      {/* Sleek single action line (1:1 with target screenshot) */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-neutral-100/60 cursor-pointer transition-colors w-fit max-w-full"
        title="点击查看执行详情"
      >
        <div className="flex items-center justify-center w-4 h-4 shrink-0">
          {icon}
        </div>

        <span className="text-[13.5px] font-normal text-[#4b5563] tracking-tight truncate leading-normal">
          {title}
        </span>

        {/* Minimalist expand indicator on hover or when expanded */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0 text-neutral-400">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </div>
      </div>

      {/* Smooth Micro-Drawer Detail on demand */}
      {isExpanded && (
        <div className="mt-1.5 ml-6 p-3 rounded-xl border border-neutral-200/80 bg-[#f8f9fa] text-xs space-y-2 select-text transition-all">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
            <span>
              {toolCall.name} {result?.isError ? '• 失败' : '• 已完成'}
            </span>
            <button
              onClick={handleCopyResult}
              className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 hover:bg-white px-1.5 py-0.5 rounded border border-neutral-200 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>复制结果</span>
                </>
              )}
            </button>
          </div>

          {/* Diff preview for modifications */}
          {(toolCall.name === 'replace_file_content' || toolCall.name === 'write_to_file') && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-neutral-400">
                修改目标：{String((toolCall.arguments as any)?.filePath || (toolCall.arguments as any)?.path || '')}
              </div>
              {toolCall.name === 'replace_file_content' ? (
                <div className="flex flex-col gap-1 font-mono text-[11px]">
                  <pre className="text-rose-600 bg-rose-50/80 border border-rose-200/80 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    - {String((toolCall.arguments as any)?.targetContent || '')}
                  </pre>
                  <pre className="text-emerald-600 bg-emerald-50/80 border border-emerald-200/80 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    + {String((toolCall.arguments as any)?.replacementContent || '')}
                  </pre>
                </div>
              ) : (
                <pre className="text-neutral-700 bg-white border border-neutral-200/80 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
                  {String((toolCall.arguments as any)?.content || '')}
                </pre>
              )}
            </div>
          )}

          {/* Result or output */}
          {result && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-0.5">
                输出结果:
              </div>
              <pre
                className={`font-mono text-[11px] p-2 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap ${
                  result.isError
                    ? 'text-rose-600 bg-rose-50 border border-rose-200'
                    : 'text-neutral-700 bg-white border border-neutral-200/80'
                }`}
              >
                {result.isError ? result.error : result.output || '(无返回内容)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
