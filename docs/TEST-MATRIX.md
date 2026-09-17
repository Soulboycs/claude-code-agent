# TEST-MATRIX: 高价值测试覆盖矩阵

遵循 `evidence-driven-engineering` 的高价值门禁规范：每个测试必须捕获真实故障，拒绝低价值浅层断言。

---

## 自动化测试矩阵清单

| 测试 ID | 测试目标 / 捕获的真实缺陷 | 测试层级 | 测试文件 | 运行命令 | 判定准则 (Pass Criteria) | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TM-01** | `view_file` 1-indexed 行号精准切片，防止越界 | 单元测试 | `test/fileTools.test.ts` | `npm test` | 行号前缀对齐，切片区间完全吻合，超限友好提示 | 🟢 验证通过 |
| **TM-02** | `replace_file_content` 唯一匹配与模糊换行容错 | 单元测试 | `test/fileTools.test.ts` | `npm test` | 唯一匹配替换成功；多处匹配或未找到时严格报错，杜绝误改 | 🟢 验证通过 |
| **TM-03** | `write_to_file` 覆写安全保护 | 单元测试 | `test/fileTools.test.ts` | `npm test` | `overwrite: false` 时禁止覆盖既有文件并抛出明确异常 | 🟢 验证通过 |
| **TM-04** | Agent ReAct 完整生命周期与多轮事件流 | 集成测试 | `test/agentEngine.test.ts` | `npm test` | 事件流依序产出，最终状态收敛至 `completed` | 🟢 验证通过 |
| **TM-05** | 人机协同 (HITL) 权限审批拦截与恢复 | 集成测试 | `test/agentEngine.test.ts` | `npm test` | 敏感操作进入 `awaiting_confirmation`，批准后恢复，驳回后安全降级 | 🟢 验证通过 |
| **TM-06** | `ToolOrchestrator` 同构切片分区 | 单元测试 | `tests/orchestrator.test.ts` | `bun test` | 连续只读工具聚合为 1 个并发 Batch；写工具严格拆入独立 Batch | 🟡 待执行 |
| **TM-07** | `ToolOrchestrator` 真实并发池上限控制 | 压力/时序测试 | `tests/orchestrator.test.ts` | `bun test` | 6 个并行只读任务真实峰值并发度 > 1 且 <= 4，总耗时接近单任务耗时 | 🟡 待执行 |
| **TM-08** | `query()` 异步生成器平铺状态机与无递归验证 | 集成测试 | `tests/queryEngine.test.ts` | `bun test` | 多轮工具调用平铺赋值流转，验证 `turnCount` 与消息回填 | 🟡 待执行 |
| **TM-09** | `query()` 危险操作审批挂起 | 集成测试 | `tests/queryEngine.test.ts` | `bun test` | 触发 `approval_required`，拦截挂起并在用户 resolve 后恢复 | 🟡 待执行 |
| **TM-10** | `Bun.serve` REST 与 SQLite 增删改查 | 集成测试 | `tests/server.test.ts` | `bun test` | `/health` 探针返回 200，`/api/sessions` 读写无损落库 | 🟡 待执行 |
| **TM-11** | WebSocket `/ws/:sessionId` 双向事件协议 | E2E 集成测试 | `tests/server.test.ts` | `bun test` | 握手返回 `connected` 与 `session_state`，ping/pong 往返 < 50ms | 🟡 待执行 |

---

## 流式输出（Smooth Typewriter Streaming）矩阵 — 2026-09-17 整改新增

| 编号 | 验证边界 | 层级 | 测试文件 | 命令 | 通过标准 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TM-S1** | `pending<=6` 极细逐字节奏（单字/帧下界） | 单元测试 | `tests/stream_pacer.test.ts` | `bun test` | TTFT 旁路后 pending=3 时单帧恰好推进 1 字符 | 🟢 验证通过 |
| **TM-S2** | `setTarget` 整体替换路径（上游修正/截断） | 单元测试 | `tests/stream_pacer.test.ts` | `bun test` | 已展示文本重新锚定到新目标前缀，旧文本零残留；截断后立即完成 | 🟢 验证通过 |
| **TM-S3** | 节奏下界（禁止直出/瞬刷退化） | 单元测试 | `tests/stream_pacer.test.ts` | `bun test` | 120 字符目标 3 帧后仍未展示完（下界），同时首帧有真实推进（上界） | 🟢 验证通过 |
| **TM-S4** | 组件级逐字渲染下界与最终追平 | 组件测试 (happy-dom) | `tests/dom/StreamingText.domtest.tsx` | `npm run test:vitest` | 200 字符流式 2 帧后部分展示、40 帧内完全追平 | 🟢 验证通过 |
| **TM-S5** | 完成态平滑收尾接线（原死路径）+ onComplete | 组件测试 (happy-dom) | `tests/dom/StreamingText.domtest.tsx` | `npm run test:vitest` | 完成瞬间不瞬跳，≤12 帧内收敛并触发 onComplete；历史消息直出无动画 | 🟢 验证通过 |
| **TM-S6** | 禁止合成反引号伪影（closeUnclosedCodeBlocks 已移除） | 组件测试 (happy-dom) | `tests/dom/StreamingText.domtest.tsx` | `npm run test:vitest` | 逐字符喂入含奇数反引号文本，展示恒为目标前缀且永不出现 `\n\`` 伪影 | 🟢 验证通过 |
| **TM-S7** | S2 心跳：5s 断流显示 [Receiving...]，新数据熄灭 | 组件测试 (happy-dom) | `tests/dom/StreamingText.domtest.tsx` | `npm run test:vitest` | 4.5s 不显示、5.5s 显示、新内容到达后熄灭 | 🟢 验证通过 |
| **TM-S8** | 滚动竞态回归：非输入源滚动不得关闭吸底 | DOM 测试 (happy-dom) | `tests/dom/scrollFollower.domtest.ts` | `npm run test:vitest` | 程序滚动/内容增长事件后仍跟随；wheel 上滚禁用；回底恢复；滚动条拖拽禁用；导航键禁用但输入框内忽略 | 🟢 验证通过 |

> 运行器隔离约定：DOM 套件命名为 `*.domtest.tsx`，bun 的发现模式不匹配该后缀，`bun test tests/` 主门禁与 `npm run test:vitest` 互不干扰（实测 bun 仍为 13 个文件）。
