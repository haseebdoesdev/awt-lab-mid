#!/bin/bash
# EC2 first-boot script (Amazon Linux 2023): installs Docker, clones the repo
# and runs start.sh. Later updates: run start.sh again (e.g. via SSM Run Command).
set -euxo pipefail

BRANCH=claude/mern-web-project-0egeq6

dnf install -y docker git
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

git clone --depth 1 --branch "$BRANCH" https://github.com/haseebdoesdev/awt-lab-mid.git /opt/pulse
chmod +x /opt/pulse/deploy/aws/start.sh
/opt/pulse/deploy/aws/start.sh
