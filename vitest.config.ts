import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// DOM 组件测试套件（happy-dom 环境）。
// 命名约定 *.domtest.tsx：bun test 的发现模式 (*.test.* / *.spec.* / *_test.*)
// 不会匹配该后缀，保证 `bun test tests/` 主门禁与 vitest DOM 套件互不干扰。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/dom/**/*.domtest.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@agent': resolve(__dirname, 'src/main/agent')
    }
  }
})
