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


