#!/usr/bin/env python3
"""Fix Nginx config to serve large desktop binary as static file, bypassing Bun proxy."""
import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('117.72.101.76', username='root', password='666l6669aA@')

CONF_PATH = '/www/server/panel/vhost/nginx/172.16.0.10.conf'

# Read current config
_, stdout, _ = ssh.exec_command(f'cat {CONF_PATH}')
config = stdout.read().decode('utf-8', errors='replace')
print("Current config length:", len(config))

# Check if already patched
if '/opt/claude-code-agent/public/downloads' in config:
    print("Already patched! Skipping.")
else:
    static_block = (
        "\n"
        "    # Direct static serving of large desktop binary (bypass Bun proxy)\n"
        "    location = /download/desktop {\n"
        "        alias /opt/claude-code-agent/public/downloads/NEXUS-AGENT-Windows-x64.zip;\n"
        '        add_header Content-Disposition \'attachment; filename="NEXUS-AGENT-Windows-x64.zip"\';\n'
        "        add_header Content-Type application/zip;\n"
        "        sendfile on;\n"
        "        tcp_nopush on;\n"
        "    }\n"
        "\n"
        "    location /downloads/ {\n"
        "        alias /opt/claude-code-agent/public/downloads/;\n"
        '        add_header Content-Disposition \'attachment\';\n'
        "        sendfile on;\n"
        "        tcp_nopush on;\n"
        "    }\n"
        "\n"
    )

    marker = "    #PROXY-CONF-START"
    if marker not in config:
        print("ERROR: Marker not found in config!")
        print(repr(config[:500]))
        ssh.close()
        exit(1)

    new_config = config.replace(marker, static_block + marker, 1)

    # Write new config via SFTP
    sftp = ssh.open_sftp()
    with sftp.open(CONF_PATH, 'w') as f:
        f.write(new_config)
    sftp.close()
    print("Config written successfully.")

# Test nginx config
_, stdout, stderr = ssh.exec_command('nginx -t 2>&1')
time.sleep(2)
test_out = stdout.read().decode() + stderr.read().decode()
print("nginx -t:", test_out)

if 'successful' in test_out or 'ok' in test_out.lower():
    _, stdout, stderr = ssh.exec_command('nginx -s reload 2>&1')
    time.sleep(2)
    reload_out = stdout.read().decode() + stderr.read().decode()
    print("nginx reload:", reload_out)
    print("SUCCESS: Nginx reloaded with static file serving for /download/desktop")
else:
    print("ERROR: nginx config test failed, NOT reloading")

# Verify the download file exists
_, stdout, _ = ssh.exec_command('ls -lh /opt/claude-code-agent/public/downloads/')
print("Downloads dir:", stdout.read().decode())

ssh.close()
