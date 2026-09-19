import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('213.176.118.9', username='root', password='x7Eu2TYUYTQQ', timeout=20)

commands = """
set -e
export DEBIAN_FRONTEND=noninteractive
ufw allow 80/tcp || true
ufw allow 443/tcp || true

# Check if caddy is installed
if ! command -v caddy &> /dev/null; then
    apt-get update -y
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
fi

# Configure Caddy
cat << 'EOF' > /etc/caddy/Caddyfile
213.176.118.9.sslip.io {
    reverse_proxy 127.0.0.1:8000
}
EOF

systemctl daemon-reload
systemctl enable caddy
systemctl restart caddy
sleep 5
systemctl status caddy --no-pager
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/setup_caddy.sh', 'w') as f:
    f.write(commands)
sftp.close()

print("Running setup_caddy.sh...")
stdin, stdout, stderr = ssh.exec_command('bash /tmp/setup_caddy.sh')
while True:
    line = stdout.readline()
    if not line:
        break
    print(line, end='', flush=True)

print("Exit code:", stdout.channel.recv_exit_status())
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
