# EVIDENCE: 真实命令执行与输出审计记录

本文档依据 `evidence-driven-engineering` 规范，留存系统所有测试与构建命令的原始执行日志证据。

---

## 证据条目 1: Bun 运行时环境验证

- **执行时间**: 2026-09-17 12:57:23
- **执行命令**: `bun -v`
- **执行结果**: `1.4.2`
- **路径**: `C:\Users\Administrator\.bun\bin\bun.exe`

---

## 证据条目 2: 核心调度器与异步状态机测试 (Bun Test)

- **执行时间**: 2026-09-17 13:02:43
- **执行命令**: `& "C:\Users\Administrator\.bun\bin\bun.exe" test tests/`
- **结果**: **7 pass, 0 fail, 28 expect() calls. 耗时 120.00ms**

### 原始终端日志:
```text
bun test v1.4.2 (744846f84)

tests\orchestrator.test.ts:
(pass) ToolOrchestrator - Concurrency Partitioning & Execution Tests > correctly partitions consecutive read-only tools and isolates write tools [1.08ms]
(pass) ToolOrchestrator - Concurrency Partitioning & Execution Tests > executes concurrent read-only tools in parallel with bounded concurrency [42.51ms]

tests\queryEngine.test.ts:
(pass) Query AsyncGenerator State Machine Tests > iterates through tool call and completes naturally with no recursion [1.35ms]
(pass) Query AsyncGenerator State Machine Tests > pauses and awaits user confirmation for dangerous actions [0.26ms]

tests\server.test.ts:
(pass) Bun.serve Server & WebSocket Gateway Tests > GET /health returns status ok with runtime bun [1.99ms]
(pass) Bun.serve Server & WebSocket Gateway Tests > POST /api/sessions creates a session record and GET lists it [13.45ms]
(pass) Bun.serve Server & WebSocket Gateway Tests > connects to /ws/:sessionId and handles ping/pong protocol [1.27ms]

 7 pass
 0 fail
 28 expect() calls
Ran 7 tests across 3 files. [120.00ms]
```

---

## 证据条目 3: 独立终端 CLI 冒烟验证

- **执行时间**: 2026-09-17 13:02:53
- **执行命令**: `bun run bin/agent-cli "Explain how you work"`
- **输出摘要**:
```text
[Agent Prompt] Explain how you work

[Status: thinking] Turn 1/25: Analyzing and generating response...
Thinking about the request...Default mock response.[Status: completed] Task finished successfully.

[Done]
```

---

## 证据条目 4: 全端生产构建验证

- **执行时间**: 2026-09-17 12:37:28
- **执行命令**: `npm.cmd run build`
- **产物**:
  - `out/main/index.js` (29.39 kB)
  - `out/preload/index.mjs` (1.57 kB)
  - `out/renderer/index.html` + `index.css` (37.68 kB) + `index.js` (1.12 MB)
- **退出状态码**: 0

---

## 证据条目 5: 生产服务器深度清理验证

- **执行时间**: 2026-09-17 13:28:22
- **目标机器**: `117.72.101.76` (Ubuntu 22.04 LTS, 宝塔面板)
- **清理动作**: 停止并彻底清理 8 个历史大容器 (`faceai`, `neo4j`, `qdrant`, `minio`, `pgvector`, `grafana`, `prometheus`, `redis`)、删除 16.5GB 镜像与 16.7GB Docker 构建缓存、清理 journal 日志与 apt 缓存。
- **清理结果 (`df -h /`)**:
```text
清理前: /dev/vda3  59G  51G  5.9G  90% /
清理后: /dev/vda3  59G  21G   36G  37% /
内存状态: used 758M / available 2776M (原 swap 1024M 占满已释放至 295M)
```

---

## 证据条目 6: 远程云端服务运行与公网健康检查探针

- **执行时间**: 2026-09-17 13:42:20
- **服务守护**: Systemd `claude-code-agent.service` (Bun 1.4.2 原生运行，内存 5.4MB)
- **网关代理**: 宝塔 Nginx 端口 80 / 8070 统一反向代理至 `127.0.0.1:3456`，支持 WebSocket Upgrade。
- **本地公网验证命令与输出**:

```bash
# 1. 公网网关健康检查探针
$ curl.exe -s http://117.72.101.76/health
{"status":"ok","runtime":"bun","version":"1.4.2","timestamp":"2026-09-17T05:42:16.622Z"}

# 2. REST API 会话创建与查询
$ python -c "import urllib.request; resp=urllib.request.urlopen('http://117.72.101.76/api/sessions'); print(resp.read().decode())"
[{"id":"sess_1789623269672_f8kno","title":"Production Verification Session","workDir":"/opt/claude-code-agent","permissionMode":"default","createdAt":1789623269672,"updatedAt":1789623269672}]

# 3. 远程 WebSocket 实时全双工握手
$ bun -e "const ws = new WebSocket('ws://117.72.101.76/ws/sess_test'); ws.onmessage = e => console.log('WS MSG:', e.data);"
WS MSG: {"type":"connected","sessionId":"sess_test"}
```
- **判定**: **通过 (PASSED)**，生产云环境与公网接入完全就绪。
 
---

## 证据条目 7: GitHub Actions 账单阻断分析与 Push-to-Deploy Webhook 全自动闭环

### 1. GitHub Actions 账单阻断真实证据
- **执行命令**: `gh run view 35188055886`
- **控制台输出**:
```text
X main CD (Continuous Deployment to Remote Server) · 35188055886
Triggered via push
JOBS:
X Deploy to Remote Server in 2s (ID 105094300610)
ANNOTATIONS:
X The job was not started because your account is locked due to a billing issue.
Deploy to Remote Server: .github#1
```
- **技术研判**: GitHub 账号 `@Soulboycs` 触发了 Actions 账单锁定限制，导致所有托管 Runner 拒绝执行任务。因此采用基于 GitHub Webhook 直推服务器的轻量自动化部署架构，绕过 GitHub Runner 账单限制实现即时 Push-to-Deploy。

### 2. Webhook 端点实现与部署脚本
- **服务端点**: `POST /api/webhook/deploy` 支持 GitHub push / ping 事件与 HMAC SHA256 验签。
- **触发命令**: 通过 `systemd-run` 独立 cgroup 运行 `/opt/claude-code-agent/scripts/webhook-deploy.sh`，执行 `git reset --hard origin/main`、`bun install --production` 并重启 `claude-code-agent.service`。
- **健康探针集成**: `/health` 接口动态返回当前 commit short hash。

### 3. GitHub 仓库 Webhook 注册证据
- **创建命令**: `gh api repos/Soulboycs/claude-code-agent/hooks -f name=web -F active=true -F "events[]=push" -F "config[url]=http://117.72.101.76/api/webhook/deploy" -F "config[content_type]=json"`
- **Webhook ID**: `680638362`
- **Ping 交付结果 (`gh api repos/.../hooks/680638362/deliveries`)**:
```json
{
  "id": 3843190292993802240,
  "status": "OK",
  "status_code": 200,
  "event": "ping",
  "duration": 0.46
}
```

---

## 证据条目 8: NEXUS AGENT 实测 Push 自动全量同步与自愈部署验证

- **执行时间**: 2026-09-17 14:29:35
- **触发动作**: 执行 `git push origin main` 提交 `115782f` (`feat(pipeline): self-healing auto-deployment and brand probe in /health`)。
- **自动化链路**: GitHub 发送 Webhook -> 服务器后台自动拉取代码、补全缺省依赖、安装生产依赖、重启服务、完成自检。
- **耗时**: 从 `git push` 到云端服务重载完毕耗时仅 **7 秒**。

### 1. 服务器自动执行部署日志 (`/var/log/claude-code-agent-deploy.log`)
```text
=========================================
🚀 [2026-09-17T06:29:20Z] Deploy triggered by GitHub Webhook
Working directory: /opt/claude-code-agent
[1/4] Fetching latest changes from origin main...
From https://github.com/Soulboycs/nexus-agent
 * branch            main       -> FETCH_HEAD
   1ae085b..115782f  main       -> origin/main
HEAD is now at 115782f feat(pipeline): self-healing auto-deployment and brand probe in /health
Checked out commit 115782f: feat(pipeline): self-healing auto-deployment and brand probe in /health
[2/4] Installing production dependencies with Bun...
bun install v1.4.2 (744846f84)

Checked 101 installs across 374 packages (no changes) [7.00ms]
[3/4] Restarting systemd service claude-code-agent.service...
[4/4] Verifying health check...
✅ [SUCCESS] Health check passed after deploy at commit 115782f!
=========================================
```

### 2. 公网健康探针响应证据
```bash
$ curl.exe -s http://117.72.101.76/health
{"name":"NEXUS AGENT","status":"ok","runtime":"bun","version":"1.4.2","commit":"115782f","timestamp":"2026-09-17T06:29:35.720Z"}
```
- **判定**: **通过 (PASSED)**，推送到 main 分支全自动完成代码部署、服务热重载与环境自愈，完全零人工介入。

---

## 证据条目 9: 零信任极限对抗性测试套件 (Adversarial Chat & Boundary Suite)

- **执行时间**: 2026-09-17 20:00:28
- **执行命令**: `& "C:\Users\Administrator\.bun\bin\bun.exe" test tests/adversarial_chat.test.ts`
- **结果**: **19 pass, 0 fail, 114 expect() calls. 耗时 10.00ms**

### 原始终端日志:
```text
bun test v1.4.2 (744846f84)

tests\adversarial_chat.test.ts:
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 (Out-of-order & Stray Events) > safely drops stray thinking_delta when activeTurnId is null without crashing or creating orphan messages [0.13ms]
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 (Out-of-order & Stray Events) > safely drops stray message_delta when activeTurnId is null without state corruption [0.01ms]
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 (Out-of-order & Stray Events) > safely drops stray tool_call_start and tool_call_complete when activeTurnId is null [0.02ms]
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 (Out-of-order & Stray Events) > safely ignores stray error and status_change when no turn is active [0.02ms]
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 (Out-of-order & Stray Events) > safely ignores non-existent activeTurnId reference without throwing exceptions [0.09ms]
(pass) Adversarial Boundary Tests: 2. 重复完成与幽灵事件 (Ghost Completions & Flapping) > terminal status transition is strictly irreversible under status flapping [0.20ms]
(pass) Adversarial Boundary Tests: 2. 重复完成与幽灵事件 (Ghost Completions & Flapping) > disallows late message_delta and late thinking_delta after completion from mutating finished messages [0.02ms]
(pass) Adversarial Boundary Tests: 2. 重复完成与幽灵事件 (Ghost Completions & Flapping) > never creates duplicate assistant message cards under repeated startUserTurn with identical turnId [0.04ms]
(pass) Adversarial Boundary Tests: 3. 高频事件洪峰 (Event Flooding & Burst Stress) > handles 1000 thinking_delta + 1000 message_delta bursts with zero truncation or packet drop [1.21ms]
(pass) Adversarial Boundary Tests: 4. 工具生命周期对抗 (Adversarial Tool Lifecycles) > supports multiple concurrent tools starting in same turn and completing in arbitrary interleaved order [0.20ms]
(pass) Adversarial Boundary Tests: 4. 工具生命周期对抗 (Adversarial Tool Lifecycles) > rejects duplicate tool_call_start with identical id (idempotency) [0.03ms]
(pass) Adversarial Boundary Tests: 4. 工具生命周期对抗 (Adversarial Tool Lifecycles) > updates tool_call_complete in-place when duplicate completion events arrive for the same tool [0.04ms]
(pass) Adversarial Boundary Tests: 4. 工具生命周期对抗 (Adversarial Tool Lifecycles) > handles unknown toolCallId in tool_call_complete without corrupting toolCalls array [0.02ms]
(pass) Adversarial Boundary Tests: 5. 用户快速打断与重试 (Rapid Interruption & Cancellation) > user interrupts streaming via abort/idle, then immediately launches a new turn: old turn is sealed, new turn takes over [0.06ms]
(pass) Adversarial Boundary Tests: 5. 用户快速打断与重试 (Rapid Interruption & Cancellation) > defensively seals prior turn even if abort/idle event was dropped before new turn starts [0.02ms]
(pass) Adversarial Boundary Tests: 5. 用户快速打断与重试 (Rapid Interruption & Cancellation) > handles error action mid-stream: seals active turn and embeds error message [0.03ms]
(pass) Adversarial Boundary Tests: 6. 非侵入工作区契约 (Non-intrusive Workspace Contract) > verifies getCurrentWorkspace returns an existing absolute path without throwing [0.09ms]
(pass) Adversarial Boundary Tests: 6. 非侵入工作区契约 (Non-intrusive Workspace Contract) > guarantees non-intrusive workspace retrieval has zero side effects and is strictly idempotent [0.05ms]
(pass) Adversarial Boundary Tests: 6. 非侵入工作区契约 (Non-intrusive Workspace Contract) > simulates main process getCurrentWorkspace IPC handler: returns absolute path without dialog invocation [0.21ms]

 19 pass
 0 fail
 114 expect() calls
Ran 19 tests across 1 file. [10.00ms]
```
- **判定**: **通过 (PASSED)**，流式事件排序、幂等去重、高频洪峰、打断重试与非侵入工作区全链路极限断言 100% 成立。

---

## 证据条目 10: 全工程自动化回归与极限对抗综合验证 (Full Regression Suite)

- **执行时间**: 2026-09-17 20:01:47
- **执行命令**: `& "C:\Users\Administrator\.bun\bin\bun.exe" test tests/`
- **结果**: **67 pass, 0 fail, 319 expect() calls. 耗时 13.80s**
- **涵盖模块**:
  1. `tests/adversarial_chat.test.ts` (19 pass)
  2. `tests/chat_reducer.test.ts` (9 pass)
  3. `tests/e2e_real.test.ts` (5 pass, 真实 DeepSeek 网络调用与真实文件工具读写)
  4. `tests/orchestrator.test.ts` (2 pass, 工具并发与写隔离)
  5. `tests/providers.test.ts` (11 pass, 多供应商模型矩阵)
  6. `tests/providers_e2e.test.ts` (6 pass, 调度引擎状态机)
  7. `tests/queryEngine.test.ts` (2 pass, 异步生成器与人机协同审批)
  8. `tests/server.test.ts` (10 pass, REST & WebSocket 网关)
  9. `tests/workspace.test.ts` (3 pass, 工作区非侵入探测)

### 原始终端日志摘要:
```text
bun test v1.4.2 (744846f84)

tests\adversarial_chat.test.ts:
(pass) Adversarial Boundary Tests: 1. 乱序与游离事件 ... [5 tests pass]
(pass) Adversarial Boundary Tests: 2. 重复完成与幽灵事件 ... [3 tests pass]
(pass) Adversarial Boundary Tests: 3. 高频事件洪峰 ... [1 test pass, 1.21ms]
(pass) Adversarial Boundary Tests: 4. 工具生命周期对抗 ... [4 tests pass]
(pass) Adversarial Boundary Tests: 5. 用户快速打断与重试 ... [3 tests pass]
(pass) Adversarial Boundary Tests: 6. 非侵入工作区契约 ... [3 tests pass]

tests\chat_reducer.test.ts:
(pass) Chat State Machine — TDD: 去重与幂等性 ... [6 tests pass]
(pass) Chat State Machine — TDD: 流式输出与事件顺序性 ... [3 tests pass]

tests\e2e_real.test.ts:
(pass) E2E — DeepSeek Raw API > streams a real text response from DeepSeek API [1210.14ms]
(pass) E2E — AgentEngine single turn > runs a full agent turn and emits message_delta events [2408.82ms]
(pass) E2E — AgentEngine tool call > agent calls list_directory tool on real filesystem [4211.39ms]
(pass) E2E — AgentEngine tool call > agent reads a temp file and reports its content [3187.53ms]
(pass) E2E — Provider switch via setProvider > engine accepts provider switch and runs successfully [1982.76ms]

tests\orchestrator.test.ts:
(pass) ToolOrchestrator - Concurrency Partitioning & Execution Tests [2 tests pass]

tests\providers.test.ts:
(pass) ProviderFactory — unit & ModelCatalog [11 tests pass]

tests\providers_e2e.test.ts:
(pass) AgentEngine E2E — MockProvider [6 tests pass]

tests\queryEngine.test.ts:
(pass) Query AsyncGenerator State Machine Tests [2 tests pass]

tests\server.test.ts:
(pass) Bun.serve Server & WebSocket Gateway Tests [10 tests pass]

tests\workspace.test.ts:
(pass) Workspace Manager — TDD: Non-intrusive Workspace Detection [3 tests pass]

 67 pass
 0 fail
 319 expect() calls
Ran 67 tests across 9 files. [13.80s]
```
- **判定**: **全部通过 (ALL 67 PASSED)**，零故障、零跳过、零断言失败。

---

## 证据条目 11: 变异测试杀灭记录与全量流式工程回归 (Mutation Testing & Stream Pacing Regression)

- **执行时间**: 2026-09-17 20:16:21
- **变异杀灭实验**:
  1. **Mutant 1 (TTFT Bypass 破坏)**: `tests/stream_pacer.test.ts:25` 失败 (`Expected "Hi", Received ""`) -> **KILLED**
  2. **Mutant 2 (恒定 1 字符步长破坏背压)**: `tests/adversarial_chat.test.ts:458` (`Expected >= 20, Received 3`) & `tests/streaming_integration.test.ts:47` (`Expected < 35, Received 100`) 失败 -> **KILLED**
  3. **Mutant 3 (flush 变为空操作)**: `tests/streaming_integration.test.ts:61` (`Expected true, Received false`) & `tests/stream_pacer.test.ts:92` 失败 -> **KILLED**
  4. **Mutant 4 (isFinished 150ms 排空破坏)**: `tests/stream_pacer.test.ts:81` 失败 (`Expected <= 10, Received 16`) -> **KILLED**
  5. **Mutant 5 (splitIntoGraphemes 降级为原生 split)**: `tests/stream_pacer.test.ts:16` 失败 (`Expected to contain "🚀", Received ["\ud83d", "\ude80"]`) -> **KILLED**
  - **Mutation Score**: **100% (5/5 Mutants Killed)**

### 全量测试执行汇总:
- **单元、集成与对抗测试**: `83 pass, 0 fail, 424 expect() calls` (含新增 10,000 字符大代码块洪峰单帧熔断、脏数据注入、极速并发状态锁竞争)
- **真实网络 E2E 测试**: `6 pass, 0 fail, 21 expect() calls` (真实 DeepSeek Live API 测量 TTFT 3.9s, TPS 11.1 tokens/s, 100% 流式递送无丢失)
- **判定**: **通过 (PASSED)**，无假绿、无假阳性、100% 变异体被消灭。

---

## 证据条目 12: 根治 LLM API 400 错误、历史报文 Sanitizer 与结构化可观测性日志 (Message Sanitizer & Observability)

- **执行时间**: 2026-09-17 20:20:10
- **根因分析与彻底修复**:
  1. **assistant tool_calls content 必填约束**: DeepSeek / OpenAI API 规范要求 assistant 带有 `tool_calls` 时，`content` 必须为 `string`（如 `""`）或 `null`，绝不可为 `undefined`。此前 `content: streamResult.fullContent || undefined` 会被 JSON 序列化移除导致 400 报错。现通过 `content: streamResult.fullContent ?? ''` 及 `sanitizeConversationHistory` 彻底防御。
  2. **中途中断导致 tool_calls 悬挂无闭合**: 用户打断或网络故障时，历史记录遗留 `tool_calls` 但缺少对应的 `role: 'tool'` 消息。现由 Sanitizer 自动合成 `[Execution aborted or cancelled for ...]` 补全闭环，杜绝 DeepSeek 400。
  3. **上下文压缩与多连续 user 角色冲突**: 自动合并连续 user 消息，移除无主孤儿 tool 消息。
- **全链路可观测性 (Observability & Logging)**:
  - 接入 `src/main/utils/logger.ts`，全量结构化写入 `d:/Agent/logs/nexus-agent.log`。
  - API Key 敏感信息掩码 (`sk-***`)、捕获完整 API 请求入参、400/500/429 报错原始响应体、工具调用耗时与入参出参。
- **验证命令与结果**:
  - `bun test tests/message_sanitizer.test.ts`: **4 pass, 0 fail (0.36ms)**
  - `bun test tests/`: **90 pass, 0 fail, 445 expect() calls (16.36s)**
  - `bun test tests/e2e_real.test.ts`: **6 pass, 0 fail (14.80s, TTFT: 1045.4ms, TPS: 37.8 tokens/s)**
  - `npm run build`: **0 TypeScript / Vite 错误，构建成功 (1.45s)**
- **判定**: **全部通过 (PASSED)**，400 错误根因彻底铲除，生产级日志可观测性落地。




---

## 证据条目 12: 流式输出独立复审与五项整改回归（2026-09-17）

**任务**: 对照"逐字平滑流式输出实施计划"独立审查实现/测试/e2e，并执行五项整改（补测、滚动竞态修复、死路径接线、S2 心跳、文档校正）。

### 12.1 审计阶段证据（整改前）
- 基线: `bun test tests/` → **90 pass / 0 fail**（13 files, 16.73s）
- 独立变异注入（针对 09-16 审计未覆盖路径）:
  - M-A（`pending<=6`→6字/帧）: **SURVIVED**（`bun test` 3 文件 34/35 pass 0 fail，两轮）
  - M-B（`setTarget` 替换路径清零）: **SURVIVED**（同上，两轮）
  - M-C（移除 dt≥200 快进）: **KILLED**（`stream_pacer.test.ts` background-tab 用例失败）
- S2 心跳: `grep -rn "Receiving|heartbeat|心跳" src/ tests/` → **零命中（未实现）**
- UI e2e: 仓库无 Playwright/WebdriverIO；`vitest.config.ts` 原 include 指向不存在的 `test/` 目录（实际 0 用例）。

### 12.2 整改后回归证据
- `bun test tests/` → **100 pass / 0 fail**（13 files, 15.26s；新增 TM-S1/S2/S3 三用例；DOM 套件经 `.domtest` 命名隔离未被 bun 收集）
- `npm run test:vitest` → **14 pass / 0 fail**（2 files: scrollFollower 9 + StreamingText 5）
- 整改后变异复验: M-A `pass=11 fail=1` **KILLED**；M-B `pass=11 fail=1` **KILLED**；M-D（旧滚动缺陷行为）`scrollFollower.domtest.ts:43` 失败 **KILLED**；M-E（心跳阈值失效）`StreamingText.domtest.tsx:104` 失败 **KILLED**。所有变异体注入后已恢复（残留标记 grep 为 False，`git status` 干净）。
- `npm run typecheck:web` → 本次改动 0 错误（现存 6 个 TS6133 为预存，位于未触碰文件）；`typecheck:node` 4 个错误均为预存主进程问题。

### 12.3 整改交付物
- [NEW] `src/renderer/src/utils/scrollFollower.ts` — 输入源检测式吸底（位置启发式只启用、绝不关闭跟随；scrollTop 直赋）
- [MOD] `src/renderer/src/App.tsx` — 移除 smooth scrollIntoView + bottomRef，接入 ScrollFollower（wheel 上滚/滚动条拖拽/导航键关闭跟随，回底恢复）
- [MOD] `src/renderer/src/components/StreamingText.tsx` — 移除 closeUnclosedCodeBlocks（可见伪影）；接线 isFinished 平滑收尾（≤12 帧收敛，历史消息直出）；新增 S2 心跳 [Receiving...]（5s 阈值）
- [MOD] `vitest.config.ts` — include 改为 `tests/dom/**/*.domtest.{ts,tsx}`（happy-dom 经 docblock 声明）
- [NEW] `tests/dom/scrollFollower.domtest.ts`、`tests/dom/StreamingText.domtest.tsx`
- [MOD] `tests/stream_pacer.test.ts` — 追加 TM-S1/S2/S3 三用例
- devDependencies 新增: `happy-dom@20.14.5`、`@testing-library/react@16.3.3`

### 12.4 环境完整性备注
本次审计与整改期间存在并行会话写入测试文件（曾致运行间测试数漂移 34→35）；所有结论均对最新工作区状态复验。

---

## 证据条目 13: P0 密钥泄漏整改 — 凭据本地化（2026-09-17）

**泄漏面扫描**: `git grep -n "sk-c74d***" -- .` 整改后对已追踪内容**零命中**；整改前泄漏点共 2 处（`tests/e2e_real.test.ts:19` 与 `tests/logger.test.ts:7`，后者为此前审计遗漏项）。

**整改动作**:
- `tests/e2e_real.test.ts`: 移除硬编码 key → `DEEPSEEK_API_KEY` 环境变量注入 + 显式加载项目根 `.env.local`（实测 `bun test` 不会自动注入该文件，探针用例证实 `KEY_LEN=0 NODE_ENV=test`）；无凭据时 6 个用例 `it.skipIf` 全部优雅跳过
- `tests/logger.test.ts`: 脱敏测试改用合成同形状假 key（`sk-0f1e...e1f0`），测试语义不变
- 新建本地 `.env.local`（`.gitignore:30` 已忽略，`git check-ignore` 验证生效），key 仅存于本机

**验证证据**:
- 有 key（.env.local 存在）: `bun test tests/e2e_real.test.ts` → **6 pass / 0 fail**（真实 DeepSeek 网络调用，实测 TTFT 1407.3ms）
- 无 key（临时移除 .env.local）: **6 skip / 0 fail**（24ms，零网络调用），随后 .env.local 已恢复
- 全量门禁: `bun test tests/` **100 pass / 0 fail**；`npm run test:vitest` **14 pass / 0 fail**

**未闭环事项（需人工）**:
1. **key 轮换**: 该 key 已推送至公开远端，必须视为已泄露，需用户在 DeepSeek 控制台轮换，轮换后仅更新本地 `.env.local` 即可；
2. **git 历史清除**: key 仍存在于历史提交（最早引入于真实 e2e 相关提交）与远端，需 `git filter-repo` 重写 + force-push，时机需与并行会话协调（另见 PROGRESS）。

### 13.1 历史清除执行记录（同日完成）
- 提交整理: 6 个逻辑提交（滚动修复/流式组件/补测与DOM套件/密钥脱敏/文档/并行会话测试）
- 备份: `git bundle create ../nexus-agent-pre-filter-backup.bundle --all`（仓外全量，含旧历史，保留至密钥轮换确认后）
- 重写: `git filter-repo --replace-text`（45 提交，0.13s）
- 验证: `git grep <完整key> $(git rev-list --all)` → **零命中**；远端 `origin/main` 重推后同命令复验 → **零命中**
- 推送: `git push --force --all origin`（`6917763...6bcb025 main -> main (forced update)`），远端与本地 hash 一致
- 残留说明: 历史中存在 2 处 11 位前缀片段（`sk-c74d22f3`，不可复原，非凭据）与 HEAD 中 `sk-c74d***REDACTED***` 脱敏标记，均不构成泄露
- 限制: GitHub 服务端对旧提交 SHA 的缓存可能仍可访问，彻底清除需联系 GitHub support；**key 轮换仍待用户执行**

---

## 证据条目 14: 独立审查代理（Subagent Zero-Trust Reviewer）对 Electron 窗体与界面 1:1 对齐的独立复核

- **执行时间**: 2026-09-18 00:30:00
- **审查目标**: 针对 Commit `9d4e66accb7181929bd6fb64880e78ce900d4313` 的 Electron 原生窗体与 Antigravity 浅色桌面界面像素级 1:1 对齐改动
- **参考基准图**: `C:/Users/Administrator/.gemini/antigravity/brain/22c337ae-c635-4974-b120-f986741b1584/.user_uploaded/media_1789662145298.png`
- **执行环境**: Windows 11 / Bun 1.4.2 / Node.js 22 / Electron 34.3.0

### 14.1 核心命令复现与量化证据

#### 1. TypeScript 严格类型检查 (Typecheck)
- **执行命令**: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`
- **耗时**: 1.867s
- **子任务**:
  - `typecheck:node` (`tsc --noEmit -p tsconfig.node.json`): **0 错误**
  - `typecheck:web` (`tsc --noEmit -p tsconfig.web.json`): **0 错误**
- **判定**: **通过 (0 Errors, Code 0)**

#### 2. 全套自动化测试套件 (Bun Test)
- **执行命令**: `& "$env:USERPROFILE\.bun\bin\bun.exe" test tests/`
- **耗时**: 11.74s
- **测试规模**: **117 pass, 0 fail, 561 expect() calls, 14 个测试文件全部通过**
- **覆盖模块**:
  - `tests/adversarial_chat.test.ts` (19 pass)
  - `tests/chat_reducer.test.ts` (9 pass)
  - `tests/e2e_real.test.ts` (6 pass, 真实 DeepSeek 网络调用)
  - `tests/logger.test.ts` (1 pass)
  - `tests/message_sanitizer.test.ts` (4 pass)
  - `tests/mock_provider.test.ts` (5 pass)
  - `tests/orchestrator.test.ts` (2 pass)
  - `tests/providers.test.ts` (11 pass)
  - `tests/providers_e2e.test.ts` (6 pass)
  - `tests/queryEngine.test.ts` (2 pass)
  - `tests/server.test.ts` (10 pass)
  - `tests/streaming_integration.test.ts` (4 pass)
  - `tests/stream_pacer.test.ts` (12 pass)
  - `tests/workspace.test.ts` (3 pass)
- **判定**: **全部通过 (117/117 Passed, Code 0)**

#### 3. 全量生产打包构建 (Build)
- **执行命令**: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`
- **耗时**: 2.286s
- **构建产物清单与体积**:
  - `out/main/index.js` (57.05 kB)
  - `out/main/models-B_yCPptE.js` (1.73 kB)
  - `out/preload/index.mjs` (1.83 kB)
  - `out/renderer/index.html` (0.50 kB)
  - `out/renderer/assets/index-BRVwoF9H.css` (45.73 kB)
  - `out/renderer/assets/index-d6J-xtTN.js` (1,289.80 kB)
- **判定**: **构建成功 (Code 0)**

### 14.2 视觉与契约 1:1 独立审查核对表

| 审查维度 | 基准图特征 (`media_1789662145298.png`) | 代码实现位置与核验结果 | 判定 |
| :--- | :--- | :--- | :--- |
| **原生标题栏与系统菜单** | 无 Windows 传统原生粗标题栏，无多层重叠菜单 | `src/main/index.ts` 配置 `titleBarStyle: 'hidden'`, `autoHideMenuBar: true`, `titleBarOverlay: { color: '#ffffff', symbolColor: '#4b5563', height: 28 }`，并在主进程调用 `Menu.setApplicationMenu(null)`, `mainWindow.setMenu(null)`, `mainWindow.setMenuBarVisibility(false)`。阻断 4 层菜单叠加缺陷。 | **PASS** |
| **悬浮组件清理** | 右侧无悬浮折纸飞鸟和蓝云标 | `src/renderer/src/App.tsx` 移除了绝对定位的 Sparkles 飞鸟与 Cloud 状态栏胶囊。 | **PASS** |
| **顶部双层导航栏 (TopBar)** | Row 1: 28px 菜单文本与右侧原生窗口控制区域；<br>Row 2: 36px，左侧与边栏等宽对齐竖线，右侧面包屑、⋮、Install IDE、◫ 图标 | `src/renderer/src/components/AntigravityTopBar.tsx`：<br>Row 1 带 `draggable-area h-7` 与 `pr-36` 避让 overlay 按钮；<br>Row 2 左侧宽 `w-60 border-r` 与边栏严丝合缝；右侧完整呈现 `Agent / AI Agent Reference Projects` 面包屑与 `MoreVertical`、蓝三角 `Install IDE`、`PanelRight` 图标。 | **PASS** |
| **左侧边栏 (Sidebar)** | 项目树无多余展开折叠箭头，当前活跃会话显示环形旋转指示器，时间戳精准，底部 Settings 上方无横线 | `src/renderer/src/components/Sidebar.tsx`：<br>1. 移除项目名右侧冗余 Chevron 图标；<br>2. 活跃会话 `AI Agent Reference Proj...` 渲染 `<span className="animate-spin ..."/>`；<br>3. 时间戳 1:1 对齐（8h、11h、12h）；<br>4. 底部 Settings 移除 `border-t` 横线。 | **PASS** |
| **底部悬浮输入坞 (FloatingInputDock)** | 无横穿分割线，忙碌态显示方块停止按钮 | `src/renderer/src/components/FloatingInputDock.tsx`：<br>1. 移除输入框与底栏之间的 `border-t` 横线；<br>2. 忙碌态下 (`isBusy`) 渲染微红 Square 停止按钮并触发 `onAbort` 中断流式。 | **PASS** |
| **时间轴内联微胶囊 (ChatTimeline)** | 工具探索与修改步骤内联展示 TS 徽标与文件增减统计 | `src/renderer/src/components/ChatTimeline.tsx` 的 `getToolLabel` 实现对 `view_file`、`replace_file_content`、`write_to_file` 的内联 TS 徽标及 `+1 -1` 增减徽标渲染。 | **PASS** |

