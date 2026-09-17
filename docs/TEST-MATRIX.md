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
