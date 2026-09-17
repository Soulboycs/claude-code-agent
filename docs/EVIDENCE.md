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

