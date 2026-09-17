import os
import sys
import time
from pathlib import Path
import paramiko

def upload():
    root = Path(__file__).resolve().parent.parent
    local_zip = root / "public" / "downloads" / "NEXUS-AGENT-Windows-x64.zip"
    if not local_zip.exists():
        print(f"[-] Local package not found: {local_zip}")
        sys.exit(1)

    file_size = local_zip.stat().st_size
    print(f"[*] Found local package: {local_zip.name} ({file_size / (1024*1024):.2f} MB)")

    # Read credentials
    env = {}
    with open(root / ".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")

    host = env["SERVER_HOST"]
    user = env["SERVER_USER"]
    port = int(env.get("SERVER_PORT", 22))
    password = env["SERVER_PASSWORD"]
    deploy_path = env.get("DEPLOY_PATH", "/opt/claude-code-agent")

    remote_dir = f"{deploy_path}/public/downloads"
    remote_target = f"{remote_dir}/{local_zip.name}"

    print(f"[*] Connecting to {user}@{host}:{port}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(hostname=host, port=port, username=user, password=password, timeout=15)

    # Ensure remote directory exists
    stdin, stdout, stderr = ssh.exec_command(f"mkdir -p {remote_dir}")
    stdout.channel.recv_exit_status()

    sftp = ssh.open_sftp()
    print(f"[*] Uploading {local_zip.name} to {remote_target}...")
    
    start_time = time.time()
    last_print = [start_time]

    def progress(transferred, total):
        now = time.time()
        if now - last_print[0] >= 2.0 or transferred == total:
            last_print[0] = now
            pct = (transferred / total) * 100
            elapsed = max(now - start_time, 0.001)
            speed_mb = (transferred / (1024 * 1024)) / elapsed
            print(f"    -> {pct:.1f}% ({transferred / (1024*1024):.1f}/{total / (1024*1024):.1f} MB) - {speed_mb:.2f} MB/s")

    sftp.put(str(local_zip), remote_target, callback=progress)
    sftp.close()

    # Set proper permissions
    stdin, stdout, stderr = ssh.exec_command(f"chmod 644 {remote_target} && ls -lh {remote_target}")
    out = stdout.read().decode().strip()
    print(f"[+] Remote file status:\n{out}")

    ssh.close()
    print("[+] Upload complete successfully!")

if __name__ == "__main__":
    upload()
