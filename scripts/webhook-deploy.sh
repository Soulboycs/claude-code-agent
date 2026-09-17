#!/usr/bin/env bash
set -e
export HOME="${HOME:-/root}"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

DEPLOY_LOG="/var/log/claude-code-agent-deploy.log"
mkdir -p "$(dirname "$DEPLOY_LOG")"
exec >> "$DEPLOY_LOG" 2>&1

echo "========================================="
echo "🚀 [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Automated Deployment Initiated"
DEPLOY_DIR="/opt/claude-code-agent"
REPO_URL="https://github.com/Soulboycs/nexus-agent.git"

# -------------------------------------------------------------
# 1. Self-Healing Toolchain & Dependencies Check
# -------------------------------------------------------------
echo "[1/6] Auditing and self-healing system dependencies..."

# Ensure curl, git, unzip exist
for pkg in curl git unzip; do
  if ! command -v "$pkg" >/dev/null 2>&1; then
    echo "[!] Missing $pkg, auto-installing via apt..."
    DEBIAN_FRONTEND=noninteractive apt-get update -y && apt-get install -y "$pkg"
  fi
done

# Ensure Bun runtime is installed
if ! command -v /usr/local/bin/bun >/dev/null 2>&1 && ! command -v bun >/dev/null 2>&1; then
  echo "[!] Missing Bun runtime, auto-installing Bun 1.4.2 via high-speed mirror..."
  mkdir -p /tmp/bun-install
  curl -fsSL https://ghfast.top/https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip -o /tmp/bun-install/bun.zip
  unzip -o /tmp/bun-install/bun.zip -d /tmp/bun-install/extracted
  cp /tmp/bun-install/extracted/bun-linux-x64/bun /usr/local/bin/bun
  chmod +x /usr/local/bin/bun
  rm -rf /tmp/bun-install
fi

BUN_BIN=$(command -v /usr/local/bin/bun || command -v bun)
echo "[+] Bun runtime ready: $($BUN_BIN --version)"

# Ensure GitHub fast mirror is configured
git config --global url."https://ghfast.top/https://github.com/".insteadOf "https://github.com/"

# -------------------------------------------------------------
# 2. Repository Sync & Worktree Integrity
# -------------------------------------------------------------
echo "[2/6] Syncing code repository at $DEPLOY_DIR..."
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  echo "[*] Repository directory not found, cloning fresh copy..."
  mkdir -p "$DEPLOY_DIR"
  git clone "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"
# Clean stale locks if prior job was interrupted
rm -f .git/index.lock .git/refs/heads/main.lock

# Set standard origin url (Git insteadOf will handle mirror transparently)
git config remote.origin.url "$REPO_URL"

echo "[*] Pulling latest commits from origin main..."
git fetch origin main --prune
git reset --hard origin/main

CURRENT_REV=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=format:'%s')
echo "[+] Code tree synced at commit $CURRENT_REV: \"$COMMIT_MSG\""

# -------------------------------------------------------------
# 3. Production Dependencies Installation
# -------------------------------------------------------------
echo "[3/6] Installing production dependencies via Bun..."
"$BUN_BIN" install --production

# -------------------------------------------------------------
# 4. Systemd Service Integrity & Auto-Configuration
# -------------------------------------------------------------
echo "[4/6] Ensuring Systemd service daemon..."
SERVICE_FILE="/etc/systemd/system/claude-code-agent.service"
cat << 'EOF' > /tmp/claude-code-agent.service
[Unit]
Description=NEXUS AGENT Bun Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/claude-code-agent
ExecStart=/usr/local/bin/bun run src/server/index.ts
Restart=always
RestartSec=3
Environment=SERVER_PORT=3456
Environment=SERVER_HOST=0.0.0.0
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

if ! cmp -s /tmp/claude-code-agent.service "$SERVICE_FILE"; then
  echo "[*] Updating systemd service definition..."
  cp /tmp/claude-code-agent.service "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable claude-code-agent.service
fi
rm -f /tmp/claude-code-agent.service

# Restart the service
echo "[*] Restarting claude-code-agent.service..."
systemctl restart claude-code-agent.service

# -------------------------------------------------------------
# 5. Reverse Proxy & Firewall Verification
# -------------------------------------------------------------
echo "[5/6] Verifying firewall and reverse proxy..."
ufw allow 3456/tcp >/dev/null 2>&1 || true
iptables -I INPUT -p tcp --dport 3456 -j ACCEPT >/dev/null 2>&1 || true

NGINX_CONF="/www/server/panel/vhost/nginx/172.16.0.10.conf"
if [ -f "$NGINX_CONF" ]; then
  if grep -q "proxy_pass http://127.0.0.1:9090;" "$NGINX_CONF"; then
    echo "[*] Auto-updating Nginx proxy pass from 9090 to 3456..."
    sed -i 's|proxy_pass http://127.0.0.1:9090;|proxy_pass http://127.0.0.1:3456;|g' "$NGINX_CONF"
    nginx -s reload || true
  fi
fi

# -------------------------------------------------------------
# 6. Post-Deployment Health Check Verification
# -------------------------------------------------------------
echo "[6/6] Verifying health check probe..."
sleep 2
HEALTH_RESP=$(curl -fsS http://127.0.0.1:3456/health || echo "FAILED")

if [ "$HEALTH_RESP" != "FAILED" ]; then
  echo "✅ [SUCCESS] Deployment completed and verified at commit $CURRENT_REV!"
  echo "Probe Response: $HEALTH_RESP"
else
  echo "⚠️ [WARNING] Health check probe failed to respond within timeout."
fi
echo "========================================="
