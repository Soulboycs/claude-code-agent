import paramiko
import time
import urllib.request
import json
import sys

import os
from pathlib import Path

# Load .env if present
env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            os.environ.setdefault(k, v)

HOST = os.environ.get("SERVER_HOST", "117.72.101.76")
PORT = int(os.environ.get("SERVER_PORT", "22"))
USER = os.environ.get("SERVER_USER", "root")
PASSWORD = os.environ.get("SERVER_PASSWORD", "")
DEPLOY_PATH = os.environ.get("DEPLOY_PATH", "/opt/claude-code-agent")
REPO_URL = os.environ.get("REPO_URL", "https://github.com/Soulboycs/claude-code-agent.git")

def deploy():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {HOST}:{PORT}...", flush=True)
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
    print("[+] Connected to server!", flush=True)

    def run_cmd(cmd, desc):
        print(f"\n---> {desc}: {cmd}", flush=True)
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode().strip()
        err = stderr.read().decode().strip()
        if out:
            print(out, flush=True)
        if err:
            print(f"[STDERR] {err}", flush=True)
        return out

    # 1. Clean up temp installer
    run_cmd("rm -rf /tmp/bun.zip /tmp/bun-extracted", "Clean tmp zip")

    # 2. Sync Repository
    run_cmd(
        f"if [ ! -d '{DEPLOY_PATH}/.git' ]; then "
        f"  mkdir -p {DEPLOY_PATH} && git clone {REPO_URL} {DEPLOY_PATH}; "
        f"else "
        f"  cd {DEPLOY_PATH} && git fetch origin main && git reset --hard origin/main; "
        f"fi; "
        f"cd {DEPLOY_PATH} && git log -1 --oneline",
        "Step 1: Sync Git Repo"
    )

    # 3. Bun install production dependencies
    run_cmd(
        f"cd {DEPLOY_PATH} && /usr/local/bin/bun install --production",
        "Step 2: Bun Install Production Dependencies"
    )

    # 4. Systemd unit file
    service_content = """[Unit]
Description=Claude Code Agent Bun Server
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
"""
    run_cmd(
        f"cat << 'EOF' > /etc/systemd/system/claude-code-agent.service\n{service_content}\nEOF\n"
        "systemctl daemon-reload && "
        "systemctl enable claude-code-agent.service && "
        "systemctl restart claude-code-agent.service",
        "Step 3: Setup & Start Systemd Service"
    )

    # 5. Check service
    time.sleep(2)
    run_cmd(
        "systemctl status claude-code-agent.service --no-pager",
        "Step 4: Check Service Status"
    )

    # 6. Check internal health
    run_cmd(
        "curl -sS http://127.0.0.1:3456/health",
        "Step 5: Internal Health Probe"
    )

    # 7. Check firewall
    run_cmd(
        "ufw allow 3456/tcp; iptables -I INPUT -p tcp --dport 3456 -j ACCEPT || true",
        "Step 6: Firewall Rules"
    )

    ssh.close()
    print("\n[+] Remote deployment completed!", flush=True)

    # 8. External Probe
    print("\n---> Step 7: External Probe from Local Client...", flush=True)
    gateway_url = f"http://{HOST}/health"
    try:
        req = urllib.request.Request(gateway_url, headers={"User-Agent": "DeployProbe/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read().decode()
            print(f"[+] Gateway Health Check (Port 80) SUCCESS! Status: {resp.status}", flush=True)
            print(f"[+] Response: {body}", flush=True)
    except Exception as e:
        print(f"[!] Gateway check info: {e}", flush=True)

    direct_url = f"http://{HOST}:3456/health"
    try:
        req = urllib.request.Request(direct_url, headers={"User-Agent": "DeployProbe/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read().decode()
            print(f"[+] Direct Health Check (Port 3456) SUCCESS! Status: {resp.status}", flush=True)
            print(f"[+] Response: {body}", flush=True)
    except Exception as e:
        print(f"[!] Direct check (Port 3456): {e} (Note: Direct access may be blocked by local proxy/firewall; Port 80 Gateway is recommended)")

if __name__ == "__main__":
    deploy()
