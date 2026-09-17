import paramiko
from pathlib import Path

def run_test():
    root = Path(__file__).resolve().parent.parent
    env = {}
    with open(root / ".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(env["SERVER_HOST"], int(env.get("SERVER_PORT", 22)), env["SERVER_USER"], env["SERVER_PASSWORD"])

    test_sh = """#!/bin/bash
set -e
echo '[*] Step 1: Downloading desktop zip via Nginx reverse proxy (http://127.0.0.1/download/desktop)...'
rm -f /tmp/test_desktop_download.zip
curl -fSL -H "Host: 117.72.101.76" http://127.0.0.1/download/desktop -o /tmp/test_desktop_download.zip

echo '[*] Step 2: Comparing SHA256 between served stream and original master zip...'
HASH_DOWNLOADED=$(sha256sum /tmp/test_desktop_download.zip | awk '{print $1}')
HASH_ORIGINAL=$(sha256sum /opt/claude-code-agent/public/downloads/NEXUS-AGENT-Windows-x64.zip | awk '{print $1}')

echo "  Served Stream SHA256: $HASH_DOWNLOADED"
echo "  Original File SHA256: $HASH_ORIGINAL"

if [ "$HASH_DOWNLOADED" != "$HASH_ORIGINAL" ]; then
    echo '[-] ERROR: SHA256 mismatch!'
    exit 1
fi
echo '[✅ PASSED] Served stream is 100% byte-identical to original file!'

echo '[*] Step 3: Extracting served archive to verify contents...'
rm -rf /tmp/test_extracted
mkdir -p /tmp/test_extracted
unzip -q /tmp/test_desktop_download.zip -d /tmp/test_extracted

echo '[+] Extracted files:'
ls -lh /tmp/test_extracted/NEXUS-AGENT-win32-x64/NEXUS-AGENT.exe
ls -la /tmp/test_extracted/NEXUS-AGENT-win32-x64/resources/app/out

echo '[*] Step 4: Cleanup...'
rm -f /tmp/test_desktop_download.zip
rm -rf /tmp/test_extracted

echo '[🎉 ALL VERIFICATION TESTS COMPLETED AND PASSED 100%]'
"""
    stdin, stdout, stderr = ssh.exec_command(f"cat << 'EOF' > /tmp/run_verify.sh\n{test_sh}\nEOF\nbash /tmp/run_verify.sh\nrm -f /tmp/run_verify.sh")
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    import sys
    sys.stdout.buffer.write(out.encode('utf-8'))
    if err:
        sys.stdout.buffer.write(b"\nSTDERR:\n" + err.encode('utf-8'))
    print("\nExit code:", code)
    ssh.close()

if __name__ == "__main__":
    run_test()
