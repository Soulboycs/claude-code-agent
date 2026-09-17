#!/usr/bin/env bash
set -e

DEPLOY_LOG="/var/log/claude-code-agent-deploy.log"
mkdir -p "$(dirname "$DEPLOY_LOG")"
exec >> "$DEPLOY_LOG" 2>&1

echo "========================================="
echo "🚀 [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Deploy triggered by GitHub Webhook"
echo "Working directory: /opt/claude-code-agent"
cd /opt/claude-code-agent

echo "[1/4] Fetching latest changes from origin main..."
git fetch origin main
git reset --hard origin/main
CURRENT_REV=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=format:'%s')
echo "Checked out commit $CURRENT_REV: $COMMIT_MSG"

echo "[2/4] Installing production dependencies with Bun..."
/usr/local/bin/bun install --production

echo "[3/4] Restarting systemd service claude-code-agent.service..."
systemctl restart claude-code-agent.service

echo "[4/4] Verifying health check..."
sleep 2
if curl -fsS http://127.0.0.1:3456/health > /dev/null; then
  echo "✅ [SUCCESS] Health check passed after deploy at commit $CURRENT_REV!"
else
  echo "⚠️ [WARNING] Health check probe failed or timed out."
fi
echo "========================================="
