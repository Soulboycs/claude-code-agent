import React from 'react'
import { Plus, X, SplitSquareHorizontal, SplitSquareVertical, MoreHorizontal } from 'lucide-react'
import type { PaneState, SplitPosition, TabTarget } from './layout-model'
import { getTabTitle } from './tab-registry'
import { useLayoutStore } from './layout-store'

/**
 * pane 顶部 tab 行(计划 §5.4):横向滚动 chip(不做测量制),
 * "+"新建会话、Split Right/Down、Close pane。点击 chip 切换聚焦 tab。
 */
export function TabBar({
  pane,
  onCreateChat,
  onSplit,
  className = ''
}: {
  pane: PaneState
  onCreateChat?: () => void
  /** 分割语义(App 提供:新建会话开进新格子);缺省回退"分屏同内容" */
  onSplit?: (position: SplitPosition, paneId: string) => void
  className?: string
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const selectTab = useLayoutStore((s) => s.selectTab)
  const closeTab = useLayoutStore((s) => s.closeTab)
  const splitPane = useLayoutStore((s) => s.splitPane)
  const closePane = useLayoutStore((s) => s.closePane)
  const doSplit = (position: SplitPosition) => {
    if (onSplit) onSplit(position, pane.id)
    else splitPane(pane.id, position, {})
  }

  return (
    <div
      data-testid={`tabbar-${pane.id}`}
      className={`flex items-stretch h-9 shrink-0 border-b border-neutral-200 bg-neutral-50 select-none ${className}`}
    >
      <div className="flex items-stretch flex-1 overflow-x-auto min-w-0">
        {pane.tabs.map((tab) => {
          const active = pane.focusedTabId === tab.tabId
          return (
            <div
              key={tab.tabId}
              data-testid={`tab-${tab.tabId}`}
              onClick={() => selectTab(pane.id, tab.tabId)}
              className={[
                'group flex items-center gap-1.5 pl-3 pr-2 my-1 mx-0.5 rounded-md cursor-pointer whitespace-nowrap text-xs',
                active
                  ? 'bg-white border border-neutral-300 shadow-xs text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-200/60'
              ].join(' ')}
              style={{ minWidth: 96, maxWidth: 160 }}
            >
              <span className="truncate flex-1" title={getTabTitle(tab.target)}>
                {getTabTitle(tab.target)}
              </span>
              {pane.tabs.length > 1 && (
                <button
                  type="button"
                  aria-label="Close tab"
                  data-testid={`close-tab-${tab.tabId}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.tabId)
                  }}
                  title="关闭标签页"
                  className="shrink-0 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-0.5 px-1.5 shrink-0">
        <button
          type="button"
          aria-label="New chat tab"
          data-testid="new-chat-tab"
          title="新建会话"
          onClick={() => onCreateChat?.()}
          className="p-1.5 rounded hover:bg-neutral-200/70 text-neutral-500"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Split right"
          data-testid={`split-right-btn-${pane.id}`}
          title="右侧分割(新会话)"
          onClick={() => doSplit('right')}
          className="p-1.5 rounded hover:bg-neutral-200/70 text-neutral-500"
        >
          <SplitSquareHorizontal className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Split down"
          data-testid={`split-down-btn-${pane.id}`}
          title="下方分割(新会话)"
          onClick={() => doSplit('bottom')}
          className="p-1.5 rounded hover:bg-neutral-200/70 text-neutral-500"
        >
          <SplitSquareVertical className="w-4 h-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Pane menu"
            data-testid={`pane-menu-${pane.id}`}
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded hover:bg-neutral-200/70 text-neutral-500"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-neutral-200 bg-white shadow-lg py-1 text-xs"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                data-testid="menu-split-right"
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false)
                  doSplit('right')
                }}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" /> 右侧分割(新会话)
              </button>
              <button
                type="button"
                data-testid="menu-split-down"
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false)
                  doSplit('bottom')
                }}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" /> 下方分割(新会话)
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                type="button"
                data-testid="menu-close-pane"
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 text-red-600 flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false)
                  closePane(pane.id)
                }}
              >
                <X className="w-3.5 h-3.5" /> 关闭此窗格
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export type { SplitPosition, TabTarget }
