import React, { useEffect, useRef, useState } from 'react'
import { StreamPacer } from '../utils/streamPacer'

interface StreamingTextProps {
  content: string
  isStreaming?: boolean
  className?: string
  onComplete?: () => void
}

/**
 * 辅助函数：虚拟补齐未闭合的 Markdown 代码块（Virtual Codeblock Autoclosing）
 * 防止流式打字中代码块因缺少结尾 ` 产生布局闪烁与样式撕裂
 */
function closeUnclosedCodeBlocks(text: string): string {
  if (!text) return text
  const codeBlockMatches = text.match(/`/g)
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    return text + '\n`'
  }
  return text
}

export const StreamingText: React.FC<StreamingTextProps> = ({
  content,
  isStreaming = false,
  className = '',
  onComplete
}) => {
  const pacerRef = useRef<StreamPacer>(new StreamPacer())
  const [displayedText, setDisplayedText] = useState<string>(() => {
    if (!isStreaming) return content || ''
    pacerRef.current.setTarget(content || '')
    return pacerRef.current.getDisplayed()
  })

  const rafIdRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(performance.now())

  useEffect(() => {
    const pacer = pacerRef.current
    pacer.setTarget(content || '')

    // 如果未处于流式状态，瞬间清空并呈现全量文本
    if (!isStreaming) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      pacer.flush()
      setDisplayedText(pacer.getDisplayed())
      onComplete?.()
      return
    }

    // 启动或维系 60fps rAF 步进循环
    const loop = (currentTime: number) => {
      const dt = currentTime - lastTimeRef.current
      lastTimeRef.current = currentTime

      // 步进消费字符
      const updated = pacer.step(dt, !isStreaming)
      setDisplayedText(updated)

      if (pacer.isDone()) {
        rafIdRef.current = null
        if (!isStreaming) {
          onComplete?.()
        }
        return
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    if (!rafIdRef.current) {
      lastTimeRef.current = performance.now()
      rafIdRef.current = requestAnimationFrame(loop)
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [content, isStreaming, onComplete])

  // 处理后台休眠切回前台事件（Visibility change）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const pacer = pacerRef.current
        if (pacer && isStreaming) {
          // 切回前台立即追上当前帧
          setDisplayedText(pacer.step(500, !isStreaming))
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isStreaming])

  // 虚拟闭合未封闭代码块
  const safeText = isStreaming ? closeUnclosedCodeBlocks(displayedText) : displayedText

  return (
    <span className={`inline ${className}`}>
      {safeText}
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-3.5 bg-blue-400 ml-0.5 translate-y-0.5 animate-pulse rounded-sm opacity-90 shadow-sm"
          style={{ willChange: 'opacity' }}
        />
      )}
    </span>
  )
}
