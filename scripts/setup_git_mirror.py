import os
from pathlib import Path
import paramiko

env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if "=" in line:
            k, v = line.strip().split("=", 1)
            os.environ.setdefault(k, v)

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect(os.environ['SERVER_HOST'], int(os.environ['SERVER_PORT']), os.environ['SERVER_USER'], os.environ['SERVER_PASSWORD'])

s.exec_command('pkill -9 -f git-remote-https; pkill -9 -f "git fetch"')
s.exec_command('git config --global url."https://ghfast.top/https://github.com/".insteadOf "https://github.com/"')
_, o, _ = s.exec_command('git config --global --get-regexp insteadof')
print('Git insteadOf configured:')
print(o.read().decode())

# Test git fetch in /opt/claude-code-agent
print("Testing fast git fetch...")
_, o2, e2 = s.exec_command('cd /opt/claude-code-agent && git fetch origin main && git log -1 --oneline')
print(o2.read().decode())
print(e2.read().decode())

s.close()
