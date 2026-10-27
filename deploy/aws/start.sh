#!/usr/bin/env bash
# (Re)deploys the API on the EC2 instance:
#   1. pulls the latest code for the deployed branch
#   2. writes .env from AWS Parameter Store (/pulse/*, secrets decrypted on the instance)
#   3. rebuilds and restarts the containers
set -euo pipefail

cd "$(dirname "$0")"
git -C ../.. pull --ff-only

REGION="${AWS_REGION:-ap-south-1}"

# Every /pulse/<NAME> parameter becomes NAME=value. Only root can read the file.
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path /pulse --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    printf '%s=%s\n' "${name#/pulse/}" "$value"
  done > .env

# Public hostname for HTTPS: <ip-with-dashes>.sslip.io resolves back to this instance.
TOKEN=$(curl -sS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
IP=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
export DOMAIN="${IP//./-}.sslip.io"

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "API deployed at https://$DOMAIN"
