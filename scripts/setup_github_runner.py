import json
import subprocess
from pathlib import Path
import paramiko

def get_runner_token():
    gh_bin = r"C:\Program Files\GitHub CLI\gh.exe"
    res = subprocess.run(
        [gh_bin, "api", "repos/Soulboycs/nexus-agent/actions/runners/registration-token", "-X", "POST"],
        capture_output=True,
        text=True,
        check=True
    )
    data = json.loads(res.stdout)
    return data["token"]

def main():
    root = Path(__file__).resolve().parent.parent
    env = {}
    with open(root / ".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")

    token = get_runner_token()
    print(f"[*] Acquired fresh GitHub runner registration token: {token[:8]}...")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        env["SERVER_HOST"],
        int(env.get("SERVER_PORT", 22)),
        env["SERVER_USER"],
        env["SERVER_PASSWORD"],
        timeout=15
    )

    setup_cmds = f"""
set -e
export RUNNER_ALLOW_RUNASROOT=1
RUNNER_DIR="/opt/actions-runner"
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -f "bin/Runner.Listener" ]; then
    echo "[*] Downloading GitHub Actions runner v2.337.0..."
    curl -fsSL https://ghfast.top/https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz -o runner.tar.gz || \
    curl -fsSL https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz -o runner.tar.gz
    tar xzf runner.tar.gz
    rm -f runner.tar.gz
    ./bin/installdependencies.sh
fi

echo "[*] Configuring runner..."
./svc.sh stop || true
./svc.sh uninstall || true
./config.sh --url https://github.com/Soulboycs/nexus-agent --token {token} --name nexus-server-runner --labels self-hosted,linux,x64 --unattended --replace

echo "[*] Installing and starting runner systemd service..."
./svc.sh install root
./svc.sh start
./svc.sh status
"""
    print("[*] Executing runner setup on remote server...")
    stdin, stdout, stderr = ssh.exec_command(setup_cmds)
    
    for line in stdout:
        print("  [OUT]", line.strip())
    
    err = stderr.read().decode()
    if err:
        print("  [ERR]", err)

    exit_code = stdout.channel.recv_exit_status()
    print(f"[+] Runner setup finished with exit code: {exit_code}")
    ssh.close()

if __name__ == "__main__":
    main()
