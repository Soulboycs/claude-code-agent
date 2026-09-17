import React, { useState, useMemo, memo } from 'react'
import { marked, Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { Check, Copy, Terminal } from 'lucide-react'

// DOMPurify configuration
const SANITIZE_CONFIG: DOMPurify.Config = {
  ADD_ATTR: ['target', 'rel'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
}

function getPurifier(): { sanitize: (html: string, cfg?: any) => string } {
  if (typeof window !== 'undefined') {
    if (typeof (DOMPurify as any).sanitize === 'function') {
      return DOMPurify as any
    }
    return (DOMPurify as any)(window)
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Window } = require('happy-dom')
    const happyWin = new Window()
    if (happyWin.Node && happyWin.Node.prototype) {
      Object.defineProperty(happyWin.Node.prototype, 'nodeName', {
        get() {
          if (this.nodeType === 1) return this.tagName
          if (this.nodeType === 3) return '#text'
          if (this.nodeType === 8) return '#comment'
          if (this.nodeType === 9) return '#document'
          if (this.nodeType === 11) return '#document-fragment'
          return ''
        },
        configurable: true
      })
    }
    return (DOMPurify as any)(happyWin)
  } catch {
    return {
      sanitize: (html: string) => html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    }
  }
}

export const purifier = getPurifier()

/**
 * Automatically close open markdown fences during streaming to prevent layout breaks.
 */
export function closeUnclosedFences(text: string): string {
  if (!text) return ''
  const fenceRegex = /^ {0,3}(`{3,}|~{3,})/gm
  let fenceCount = 0
  while (fenceRegex.exec(text) !== null) {
    fenceCount++
  }
  if (fenceCount % 2 !== 0) {
    return text + '\n```'
  }
  return text
}

export interface CodeBlockData {
  id: string
  code: string
  language?: string
}

interface CodeBlockProps {
  code: string
  language?: string
}

const CodeBlock: React.FC<CodeBlockProps> = memo(({ code, language }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = code
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code block:', err)
    }
  }

  const displayLang = (language || 'text').toUpperCase()

  return (
    <div className="my-3 rounded-lg border border-[#262833] bg-[#121316] overflow-hidden text-xs shadow-md">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1b22] border-b border-[#262833] select-none text-neutral-400">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-neutral-300">
          <Terminal className="w-3.5 h-3.5 text-neutral-500" />
          <span>{displayLang}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans hover:bg-[#262833] text-neutral-400 hover:text-neutral-200 transition-colors"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <pre className="p-3.5 overflow-x-auto font-mono leading-relaxed text-neutral-200 text-xs selection:bg-blue-600/30">
        <code>{code}</code>
      </pre>
    </div>
  )
})

CodeBlock.displayName = 'CodeBlock'

export type RenderNode =
  | { type: 'html'; content: string; key: string }
  | { type: 'code'; code: string; language?: string; key: string }

export function parseMarkdownToNodes(content: string, isStreaming = false): RenderNode[] {
  if (!content || !content.trim()) return []

  const rawText = isStreaming ? closeUnclosedFences(content) : content
  const codeBlocks: CodeBlockData[] = []

  const customRenderer = new marked.Renderer()
  customRenderer.code = function ({ text, lang }: Tokens.Code) {
    const id = `cb-${codeBlocks.length}`
    codeBlocks.push({
      id,
      code: text,
      language: lang ? lang.trim().split(/\s+/)[0]?.toLowerCase() : undefined
    })
    return `<div data-codeblock-id="${id}"></div>`
  }

  let fullHtml = ''
  try {
    fullHtml = marked.parse(rawText, {
      renderer: customRenderer,
      gfm: true,
      breaks: true
    }) as string
  } catch (err) {
    console.error('marked parse error:', err)
    return [{ type: 'html', content: purifier.sanitize(rawText, SANITIZE_CONFIG), key: 'fallback' }]
  }

  if (codeBlocks.length === 0) {
    const clean = purifier.sanitize(fullHtml, SANITIZE_CONFIG)
    return clean.trim() ? [{ type: 'html', content: clean, key: 'html-single' }] : []
  }

  const nodes: RenderNode[] = []
  let remaining = fullHtml

  for (const block of codeBlocks) {
    const marker = `<div data-codeblock-id="${block.id}"></div>`
    const idx = remaining.indexOf(marker)
    if (idx === -1) continue

    const before = remaining.slice(0, idx)
    if (before.trim()) {
      nodes.push({
        type: 'html',
        content: purifier.sanitize(before, SANITIZE_CONFIG),
        key: `html-before-${block.id}`
      })
    }

    nodes.push({
      type: 'code',
      code: block.code,
      language: block.language,
      key: `code-${block.id}`
    })

    remaining = remaining.slice(idx + marker.length)
  }

  if (remaining.trim()) {
    nodes.push({
      type: 'html',
      content: purifier.sanitize(remaining, SANITIZE_CONFIG),
      key: 'html-remaining'
    })
  }

  return nodes
}

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(
  ({ content, isStreaming = false, className = '' }) => {
    const renderNodes = useMemo(() => {
      return parseMarkdownToNodes(content, isStreaming)
    }, [content, isStreaming])

    if (!renderNodes || renderNodes.length === 0) {
      return null
    }

    return (
      <div className={`nexus-markdown ${className}`}>
        {renderNodes.map((node) => {
          if (node.type === 'code') {
            return <CodeBlock key={node.key} code={node.code} language={node.language} />
          }
          return (
            <div
              key={node.key}
              dangerouslySetInnerHTML={{ __html: node.content }}
            />
          )
        })}
      </div>
    )
  }
)

MarkdownRenderer.displayName = 'MarkdownRenderer'
export default MarkdownRenderer
