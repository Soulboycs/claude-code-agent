/**
 * ScrollFollower: 智能吸底跟随器（修复 2026-09-17 审计发现的滚动竞态）
 *
 * 旧实现的缺陷：把"距底部 > 阈值"一律视为用户上滚并关闭吸底。但程序触发的
 * smooth scrollIntoView 动画会持续产生中途滚动事件，且流式内容增长会使动画
 * 落点距新底部超过阈值 → 吸底被误关，跟随永久停摆。
 *
 * 修复原则（输入源检测）：
 * 1. 只有真实用户输入（滚轮向上 / 滚动条拖拽 / 导航键）才会关闭跟随；
 * 2. 位置启发式只用于"重新启用"（用户回到底部即恢复跟随），绝不用于关闭；
 * 3. 跟随动作为 scrollTop 直赋（瞬时落底），不产生 smooth 动画的中途事件。
 */

const USER_NAV_KEYS = new Set(['PageUp', 'ArrowUp', 'Home'])
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export interface ScrollFollower {
  /** 绑定到容器 onScroll：仅在底部时恢复跟随；拖拽滚动条离开底部时关闭跟随 */
  handleScroll(): void
  /** 时间线增长后调用：若处于跟随态则瞬时落底 */
  follow(): void
  /** 强制恢复跟随并立即落底（用于用户发送新消息） */
  forceFollow(): void
  isFollowing(): boolean
  detach(): void
}

export function createScrollFollower(el: HTMLElement, threshold: number = 80): ScrollFollower {
  let following = true
  let pointerDown = false

  const distanceFromBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight
  const atBottom = () => distanceFromBottom() < threshold

  const onWheel = (e: WheelEvent) => {
    // 向上滚动是明确的离开底部意图
    if (e.deltaY < 0) following = false
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.(EDITABLE_SELECTOR)) return // 输入框内的方向键不构成滚动意图
    if (USER_NAV_KEYS.has(e.key)) following = false
  }

  const onPointerDown = () => {
    pointerDown = true // 覆盖滚动条拖拽与触摸拖动（Pointer Events 统一二者）
  }

  const onPointerUp = () => {
    pointerDown = false
  }

  el.addEventListener('scroll', handleScroll, { passive: true })
  el.addEventListener('wheel', onWheel, { passive: true })
  el.addEventListener('keydown', onKeyDown)
  el.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)

  function handleScroll(): void {
    if (atBottom()) {
      following = true
    } else if (pointerDown) {
      // 按住滚动条/触摸拖动离开底部 = 用户意图（程序滚动不会置位 pointerDown）
      following = false
    }
  }

  return {
    handleScroll,
    follow() {
      if (!following) return
      el.scrollTop = el.scrollHeight // 瞬时直赋：无动画、无中途事件、精确落在实时底部
    },
    forceFollow() {
      following = true
      el.scrollTop = el.scrollHeight
    },
    isFollowing: () => following,
    detach() {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }
}
