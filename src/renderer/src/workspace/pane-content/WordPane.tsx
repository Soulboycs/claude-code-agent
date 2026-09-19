import { FileText } from 'lucide-react'
import type { TabContentProps } from '../tab-registry'
import type { TabTarget } from '../layout-model'

/**
 * word kind 占位(计划 §10 阶段三实装):
 * Word 编辑器迁入 pane 前,先保证 tab 类型体系完整可注册。
 */
export function WordPane({ target }: TabContentProps<Extract<TabTarget, { kind: 'word' }>>) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-400 bg-white" data-testid="word-pane-placeholder">
      <FileText className="w-10 h-10" />
      <div className="text-sm">文档 pane</div>
      <div className="text-xs text-neutral-300 max-w-xs text-center break-all">{target.path}</div>
      <div className="text-xs">将在阶段三接入 Word 编辑器并启用文档联动</div>
    </div>
  )
}
