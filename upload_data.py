import paramiko
from scp import SCPClient
import sys

ip = '213.176.118.9'
user = 'root'
pwd = 'x7Eu2TYUYTQQ'

print(f"Connecting to {ip}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(ip, username=user, password=pwd, timeout=30)
print("Connected!")

print("Uploading data_bundle.tar.gz (41.5 MB)...")
with SCPClient(ssh.get_transport()) as scp:
    scp.put('data_bundle.tar.gz', '/root/data_bundle.tar.gz')
print("Upload complete!")

print("Extracting data into /root/app/...")
stdin, stdout, stderr = ssh.exec_command('cd /root/app && tar -xzf /root/data_bundle.tar.gz && systemctl restart kosmo-backend')
print("Exit status:", stdout.channel.recv_exit_status())

stdin, stdout, stderr = ssh.exec_command('ls -la /root/app/data/RU_TVER_01')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
print("Done!")
