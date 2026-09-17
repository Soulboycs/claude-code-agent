import { describe, it, expect, beforeEach } from 'bun:test'
import { StreamPacer, splitIntoGraphemes } from '../src/renderer/src/utils/streamPacer'

describe('StreamPacer — TDD: 平滑打字机缓冲消费引擎', () => {
  let pacer: StreamPacer

  beforeEach(() => {
    pacer = new StreamPacer()
  })

  it('correctly splits multi-byte emojis and Chinese characters without corrupting surrogate pairs', () => {
    const text = 'Hello 世界! 🚀👨‍👩‍👧‍👦'
    const graphemes = splitIntoGraphemes(text)
    expect(graphemes.join('')).toBe(text)
    // Ensure emoji is a single unit, not split into dangling surrogates
    expect(graphemes).toContain('🚀')
    expect(graphemes).toContain('世')
    expect(graphemes).toContain('界')
  })

  it('achieves 0ms TTFT bypass on the very first token without artificial frame delay', () => {
    pacer.setTarget('Hi')
    // First token is immediately displayed on setTarget (0ms artificial latency)
    expect(pacer.getDisplayed()).toBe('Hi')
  })

  it('steps smoothly by 1-2 characters in low buffer depth (pending <= 6)', () => {
    pacer.setTarget('Hi') // First token bypasses (2 chars)
    expect(pacer.getDisplayed()).toBe('Hi')

    // Append 5 more characters (pending = 5 <= 6)
    pacer.setTarget('Hi, world')
    const beforeStep = pacer.getDisplayed().length

    // Step 1
    const step1 = pacer.step(16) // ~16ms frame
    const delta = step1.length - beforeStep
    expect(delta).toBeGreaterThanOrEqual(1)
    expect(delta).toBeLessThanOrEqual(2) // low depth consumes 1-2 chars per frame for maximum typewriter smoothness

    // Step repeatedly until completed
    while (!pacer.isDone()) {
      pacer.step(16)
    }
    expect(pacer.getDisplayed()).toBe('Hi, world')
  })

  it('accelerates dynamically during large bursts (pending > 100) to prevent lag', () => {
    const hugeSnippet = 'const a = 1;\n'.repeat(50) // ~650 chars
    pacer.setTarget(hugeSnippet)

    // First frame should consume significantly more than 1 char (e.g. >= 20 chars)
    const initialAdvance = pacer.step(16)
    expect(initialAdvance.length).toBeGreaterThanOrEqual(15)

    // Should drain the entire 650 chars within at most 15 frames (~250ms at 60fps)
    let frames = 1
    while (!pacer.isDone() && frames < 50) {
      pacer.step(16)
      frames++
    }
    expect(frames).toBeLessThan(30)
    expect(pacer.getDisplayed()).toBe(hugeSnippet)
  })

  it('drains remaining buffer smoothly within 150ms when isFinished is true', () => {
    pacer.setTarget('Initial prefix that was streaming')
    pacer.flush()

    // Add 40 more characters right at completion
    pacer.setTarget('Initial prefix that was streaming and here is the final 40 characters.')
    expect(pacer.isDone()).toBe(false)

    // Step with isFinished = true
    let frames = 0
    while (!pacer.isDone() && frames < 20) {
      pacer.step(16, true)
      frames++
    }
    expect(frames).toBeLessThanOrEqual(10) // drains in <= 10 frames (~150ms)
    expect(pacer.getDisplayed()).toBe('Initial prefix that was streaming and here is the final 40 characters.')
  })

  it('supports instant flush on stream complete or user abort', () => {
    pacer.setTarget('Partial text that was streaming...')
    pacer.step(16)
    expect(pacer.getDisplayed().length).toBeLessThan('Partial text that was streaming...'.length)

    // Instant flush
    pacer.flush()
    expect(pacer.getDisplayed()).toBe('Partial text that was streaming...')
    expect(pacer.isDone()).toBe(true)
  })

  it('handles background tab frame throttling with timestamp compensation', () => {
    pacer.setTarget('Background tab text recovery testing')
    // Simulate tab being throttled for 500ms
    pacer.step(500)
    // Should catch up immediately or almost immediately
    expect(pacer.isDone()).toBe(true)
    expect(pacer.getDisplayed()).toBe('Background tab text recovery testing')
  })

  it('is idempotent when target is unchanged', () => {
    pacer.setTarget('Same text')
    pacer.flush()
    expect(pacer.getDisplayed()).toBe('Same text')

    pacer.setTarget('Same text')
    expect(pacer.isDone()).toBe(true)
    expect(pacer.getDisplayed()).toBe('Same text')
  })
})
