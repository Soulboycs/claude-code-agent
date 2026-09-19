import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { useI18n } from '../i18n/locale'
import { WRAP_OPTIONS } from './ContextMenu'

/**
 * Word's floating "layout options" button (the little rainbow): shown at the
 * top-right corner of a selected image, opens the wrap-mode list in one click
 * instead of hunting through the ribbon / context menu. Reuses the exact
 * WRAP_OPTIONS set of the context menu; applies the same updateAttributes
 * path, so undo and the save pipeline behave identically.
 */
export function ImageWrapPopover({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const selection = editor.state.selection
  const info = useMemo(() => {
    if (!(selection instanceof NodeSelection)) return null
    const node = selection.node
    if (node.type.name !== 'docProtected' || node.attrs.blockType !== 'image') return null
    if (!editor.isEditable) return null
    const dom = editor.view.nodeDOM(selection.from) as HTMLElement | null
    if (!dom) return null
    return { pos: selection.from, wrap: (node.attrs.imageWrap as string | null) ?? null }
    // recompute when the selection identity changes
  }, [editor, selection]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!info) {
      setAnchor(null)
      return
    }
    const update = () => {
      const dom = editor.view.nodeDOM(info.pos) as HTMLElement | null
      if (!dom) return
      const r = dom.getBoundingClientRect()
      setAnchor({ top: r.top, left: r.right })
    }
    update()
    // follow scrolling of any container and window resizes (fixed positioning)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor, info])

  // close on outside mousedown / Escape
  useEffect(() => {
    if (!anchor) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.image-wrap-pop')) return
      setAnchor(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnchor(null)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor])

  if (!info || !anchor) return null

  const apply = (wrap: string | null) => {
    const attrs: Record<string, unknown> =
      wrap === null
        ? { imageWrap: wrap, imagePosH: null, imagePosV: null, imageOffsetXEmu: null, imageOffsetYEmu: null }
        : { imageWrap: wrap }
    editor.view.focus()
    editor
      .chain()
      .focus()
      .updateAttributes('docProtected', attrs)
      .run()
  }

  return (
    <div
      className="image-wrap-pop"
      style={{ top: anchor.top - 6, left: anchor.left + 6 }}
      role="toolbar"
      aria-label={t('appWrapOptions')}
    >
      <button
        className="image-wrap-pop-toggle"
        data-tip={t('appWrapOptions')}
        onClick={() => undefined}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 7a6 6 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <div className="image-wrap-pop-menu">
        {WRAP_OPTIONS.map(({ labelKey, value }) => (
          <button
            key={labelKey}
            className={info.wrap === value ? 'active' : ''}
            onClick={() => apply(value)}
          >
            {info.wrap === value ? '✓ ' : ''}
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
