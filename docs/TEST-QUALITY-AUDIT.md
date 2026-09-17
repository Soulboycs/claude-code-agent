# TEST-QUALITY-AUDIT: 测试真实性与质量审查报告

依据 `evidence-driven-engineering` 规范，对本项目的所有测试用例执行独立对抗性审查，剔除虚假全绿（False Positive）与低价值宽泛 Mock。

---

## 1. 核心审查准则

审查项 | 要求 | 判定标准
:--- | :--- | :---
**真实调用** | 是否调用真实对象而非空壳？ | 必须执行真实的 `ToolRegistry`、`ToolOrchestrator`、`chatReducer`、`Bun.serve`、`Database`
**反脆弱性** | 被测代码损坏时是否会真正失败？ | 人工故障注入，验证断言具备硬性失败能力
**副作用验证** | 是否校验了真实文件/数据库/Socket/状态机？ | 状态变更、磁盘读取、IPC 契约必须严格物理验证
**反例覆盖** | 是否覆盖乱序、重入、幽灵事件、洪峰压力等对抗路径？ | 验证多次匹配、洪峰丢包、游离事件无害化、不可逆终态

---

## 2. 逐项审查明细

### 2.1 极限对抗性测试套件 (`tests/adversarial_chat.test.ts`)
- **真实被测对象**: 纯状态 Reducer `chatReducer`、`startUserTurn` 契约及非侵入工作区 IPC 契约
- **故障注入与真实有效性审查**:
  1. **乱序与游离事件 (Out-of-order & Stray Events)**:
     - 注入：在 `activeTurnId === null` 时连续推入 `thinking_delta`、`message_delta`、`tool_call_start`、`error`。
     - 真实断言：断言 `nextState.messages.length === 0` 且对象未发生任何变异。若代码存在孤儿消息残留或解构异常，断言硬性失败。
  2. **重复完成与幽灵状态抖动 (Ghost Completions & Flapping)**:
     - 注入：连续派发 4 次 `status_change: completed / error / idle / completed`，并在结束后追加入侵式 `message_delta`。
     - 真实断言：断言消息 `isStreaming === false` 且内容未被晚到数据篡改，验证终态单向不可逆。
  3. **高频洪峰事件注入 (1000 Thinking + 1000 Message Burst Stress)**:
     - 注入：2000 个高频细粒度增量字符串连续灌入 Reducer。
     - 真实断言：严格比对拼接后完整字符串的字节长度与内容精确等价性，且单次执行耗时严格限制在 500ms 内（实测 1.21ms），无截断、无堆栈溢出。
  4. **并发工具交错生命周期 (Adversarial Tool Lifecycles)**:
     - 注入：同 Turn 启动 A/B/C 三个工具，乱序与反序触发完成（B -> C -> A），并注入未知 toolCallId 的非法结果和重复的 start 事件。
     - 真实断言：严格检查 `toolCalls` 去重（长度保持 1）、结果原位更新而非盲目追加。未知 toolCallId 结果进入数组但不破坏工具队列。
  5. **打断重入与防御性终结 (Rapid Interruption & Cancellation)**:
     - 注入：在首轮流式中突发中断并立即开启次轮 Turn；注入故意丢弃 abort 事件的跳步异常。
     - 真实断言：断言旧 Turn 彻底剥离 `isStreaming: true` 标记，新 Turn 获得独立流式激活权，彻底根除双光标与消息串扰。
  6. **非侵入工作区契约 (Non-intrusive Workspace Contract)**:
     - 注入：高并发 20 次请求 `getCurrentWorkspace`，拦截底层 Electron `dialog.showOpenDialog`。
     - 真实断言：验证 `dialogOpenCallCount === 0`，返回绝对路径且无任何弹窗副作用。
- **结论**: **19 项对抗性用例全部真实调用核心逻辑，硬性断言覆盖零信任边界，通过门禁。**

### 2.2 流式状态机与幂等去重测试 (`tests/chat_reducer.test.ts`)
- **真实被测对象**: `src/renderer/src/utils/chatReducer.ts`
- **故障注入验证**:
  - 重复派发相同 turnId 的 `start_turn`，断言消息总数保持 2 且绝不分裂。
  - 工具完成事件重复到达时，原地更新 output 而不追加重复节点。
- **结论**: **真实验证了单一真理源状态机的强幂等性，通过门禁。**

### 2.3 工具并发编排调度测试 (`tests/orchestrator.test.ts`)
- **真实被测对象**: `ToolOrchestrator.partition()` 与 `ToolOrchestrator.executeBatches()`
- **故障注入验证**:
  - 若将只读工具与写工具错误合并为一个 Batch，测试立即失败（断言批次长度与 `isConcurrencySafe` 属性）。
  - 若移除并发池 `Promise.race` 导致串行执行，时序测试中的 `peakConcurrency > 1` 将立即失败。
- **结论**: **真实有效，非浅层 Mock，通过门禁。**

### 2.4 状态机与人工审批测试 (`tests/queryEngine.test.ts`)
- **真实被测对象**: `query()` 异步生成器循环
- **故障注入验证**:
  - 若状态机产生死循环或递归栈溢出，测试将超时终止失败。
  - 若工具 `requiresApproval` 判定失效直接执行，`approvalHandled` 断言失败。
- **结论**: **真实验证了人机协同拦截与状态平铺推进，通过门禁。**

### 2.5 本地服务与 SQLite 会话测试 (`tests/server.test.ts`)
- **真实被测对象**: `Bun.serve` 原生 HTTP 路由、原生 WebSocket 网关、`bun:sqlite` 磁盘数据库
- **副作用验证**:
  - 调用 `POST /api/sessions` 后，通过物理数据库查询验证数据已被写入。
  - 建立真实客户端 WebSocket 连接，双向往返 `ping` 与 `pong`。
- **结论**: **全链路真实端到端测试，无虚拟插桩，通过门禁。**

### 2.7 真实平滑打字机与流控引擎测试 (`tests/stream_pacer.test.ts` & `tests/streaming_integration.test.ts`)
- **真实被测对象**: `StreamPacer` 自适应滑动窗口流控器与双轨架构
- **真实性审计**:
  - Grapheme 字符簇断字防护（Unicode 15.0 规范，包含 Emoji 👨‍👩‍👧‍👦 与汉字多字节测试）；
  - TTFT 0ms 旁路直通逻辑（首包即刻上屏，严格比较 `displayedText` 与输入）；
  - 1000 事件洪峰在 35 帧（< 500ms）内排空验证；
  - Abort 瞬间 flush 丢字率校验（严格字符数量匹配）。
- **结论**: **真实验证工业级流式体验与背压机制，通过门禁。**

---

## 3. 假阳性排查与变异测试（Mutation Testing）审计专章

依据 `evidence-driven-engineering` 准则，为彻底根除“测试绿灯但无法捕获故障”的假阳性（False Positives），独立审查员执行了反向证明法——**对生产代码注入 5 组关键故障变异体（Mutants），实机执行测试套件并观测其被杀灭的硬性证据**。

### 变异杀伤率总览 (Mutation Score)
- **注入变异体总数**: 5
- **成功杀灭（Kill）变异体数**: 5
- **逃逸（Survive）变异体数**: 0
- **变异杀伤率 (Mutation Score)**: **100% (5/5 KILLED)**

### 变异杀灭实验证据表

| 变异编号 | 变异注入点与破坏动作 | 预期被破坏的生产行为 | 捕获该故障的测试文件与断言位置 | 杀灭证据（错误输出日志） | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mutant 1** | 注释掉 `StreamPacer.setTarget()` 中的 `isFirstTokenOfTurn` 0ms 旁路逻辑 | 首字无法立即上屏，被迫进入帧队列等待，导致 TTFT 恶化 | `tests/stream_pacer.test.ts:25`<br>`expect(pacer.getDisplayed()).toBe('Hi')` | `Expected: "Hi"`<br>`Received: ""` | **KILLED** |
| **Mutant 2** | 将 `StreamPacer.step()` 中的自适应流速曲线改为恒定 `stepCount = 1` | 失去背压自适应能力，大代码块与洪峰时产生严重积压滞后 | 1. `tests/adversarial_chat.test.ts:458`<br>2. `tests/streaming_integration.test.ts:47`<br>3. `tests/stream_pacer.test.ts:55` | `Expected: >= 20, Received: 3`<br>`Expected: < 35, Received: 100` | **KILLED** (3重拦截) |
| **Mutant 3** | 将 `StreamPacer.flush()` 改为空操作（返回当前已渲染文本） | 用户 Abort 或流结束时无法瞬间排空缓冲区，引发字符丢失或假死 | 1. `tests/streaming_integration.test.ts:61`<br>2. `tests/stream_pacer.test.ts:92`<br>3. `tests/stream_pacer.test.ts:101` | `Expected: true, Received: false`<br>`Expected: "Partial text..."`<br>`Received: "Partial "` | **KILLED** (4重拦截) |
| **Mutant 4** | 注释掉 `StreamPacer.step()` 中的 `isFinished` 150ms 平滑收敛逻辑 | 完成态流式无法在 150ms (10 帧) 内快速收敛，拖慢界面就绪时间 | `tests/stream_pacer.test.ts:81`<br>`expect(frames).toBeLessThanOrEqual(10)` | `Expected: <= 10`<br>`Received: 16` | **KILLED** |
| **Mutant 5** | 将 `splitIntoGraphemes()` 降级为原生 `text.split('')` | Emoji 复合字符簇（如 🚀 或 👨‍👩‍👧‍👦）被劈成乱码的 UTF-16 代理对 | `tests/stream_pacer.test.ts:16`<br>`expect(graphemes).toContain('🚀')` | `Expected to contain: "🚀"`<br>`Received: ["\ud83d", "\ude80", ...]` | **KILLED** |

---

## 4. 审查裁决
测试套件真实度评级: **A+ (High Value, Zero Fake-Pass, 100% Mutation Killed)**
- 无断言测试: 0
- 仅断言“不抛异常”测试: 0
- 宽泛 Mock 逃逸测试: 0
- 对抗性边界断言占比: 100%
- 变异体杀灭率: 100% (5/5)
- 零信任审查结论: **所有测试均具备硬性故障拦截能力，彻底剔除假阳性，具备工业级抗脆弱性。**


---

## 5. 独立复审与历史结论校正（2026-09-17，主代理独立执行）

> 本节证据 **supersede** 第 4 节 2026-09-16 的裁决。历史结论予以保留但降级，原因见下。

### 5.1 对 2026-09-16 "A+ / 100% Mutation Killed" 裁决的校正

第 4 节的变异测试只注入了 **5 个自选变异体**，"100% 杀灭"仅对这 5 个成立，不能外推为实现的变异空间。独立复审注入了该审计未覆盖的新变异体：

| 变异编号 | 破坏动作 | 复审结果 | 处置 |
| :--- | :--- | :--- | :--- |
| **M-A** | `pending<=6` 分支 1字/帧 → 6字/帧（摧毁逐字节奏下界） | **存活**（两轮复验 35 pass 全绿） | 已补 TM-S1 测试，复验 **KILLED** |
| **M-B** | `setTarget` 整体替换路径清零 | **存活**（两轮复验全绿） | 已补 TM-S2 测试，复验 **KILLED** |
| **M-C** | 移除 dt>=200ms 后台快进 | 杀灭（与 09-16 声称一致） | 无需处置 |

**根因（结构性假阳性）**：全部节奏断言均为上界（"不能太慢"），无下界保护"不能太快"；且 `stream_pacer.test.ts:28` 名为 `pending <= 6` 的测试实际运行于 pending=7（走 7-20 分支），测试名与实际行为不符。

**校正后评级**：`A+ / 100% / Zero Fake-Pass` → **`B+（引擎主干路径保护真实：TTFT/背压/Abort/后台补偿；节奏下界与替换路径于 2026-09-17 补测后达标；组件层覆盖由 0 → 14 用例）`**。

### 5.2 2026-09-17 整改新增测试的杀伤力验证（全部 KILLED 实证）

| 变异编号 | 破坏动作 | 拦截测试 | 结果 |
| :--- | :--- | :--- | :--- |
| **M-A**（复验） | `pending<=6` 分支提速 6 倍 | TM-S1（`pass=11 fail=1`） | **KILLED** |
| **M-B**（复验） | `setTarget` 替换路径清零 | TM-S2（`pass=11 fail=1`） | **KILLED** |
| **M-D** | handleScroll 恢复旧位置启发式（滚动竞态缺陷行为） | TM-S8 回归用例（scrollFollower.domtest.ts:43 失败） | **KILLED** |
| **M-E** | 心跳阈值 5000→50000（S2 失效） | TM-S7（StreamingText.domtest.tsx:104 失败） | **KILLED** |

### 5.3 审计发现但未在测试层处置的事项

- `tests/e2e_real.test.ts:16` 硬编码真实 DeepSeek API key 且已推送远端仓库（P0 安全，需轮换密钥 + 历史清除，超出测试审计处置范围）；
- UI 层 e2e（Playwright/驱动 Electron）仍然缺失，DOM 套件只覆盖组件与工具层，不等于端到端视觉验证；
- `npm run typecheck` 存在 4 个主进程侧预存类型错误（AgentEngine.ts:107 / fileTools.ts:128 / index.ts:131,136）与 6 个 renderer 未使用导入警告，均非本次整改引入。
