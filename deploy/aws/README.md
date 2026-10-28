# Live deployment (Vercel + AWS + MongoDB Atlas)

| Part | Where | Address |
| --- | --- | --- |
| React app | Vercel project `pulse-chat` | https://pulse-chat-bay.vercel.app |
| API + Socket.IO | AWS EC2 `pulse-chat-api` (t3.small, ap-south-1) behind Caddy | https://15-252-225-242.sslip.io |
| Database | MongoDB Atlas `Cluster0`, database `pulse`, user `pulse-app` (readWrite on `pulse` only) | – |

```
Browser ──► Vercel (static app)
   │          └─ /api/*  ──rewrite──►  Caddy (HTTPS) ─► API container ─► Atlas
   └──────── WebSocket (Socket.IO) ──►  Caddy (HTTPS) ─┘
```

- `/api` goes through Vercel's rewrite (`client/vercel.json`), so the auth cookies belong to the
  Vercel domain.
- The WebSocket connects straight to the API (`VITE_SOCKET_URL`) and authenticates with a
  60-second token from `/api/auth/socket-token`.
- `15-252-225-242.sslip.io` resolves to the Elastic IP; Caddy gets a Let's Encrypt certificate for it.

## AWS resources (all tagged `project=pulse`)

- EC2 instance `pulse-chat-api`. No SSH port: manage it with **Systems Manager → Session Manager**
  or Run Command.
- Elastic IP `15.252.225.242`, security group `pulse-web` (ports 80/443 only).
- IAM role `pulse-ec2-role` (Systems Manager access, plus reading `/pulse/*` parameters).
- **Parameter Store** `/pulse/*`: `MONGO_URI`, `JWT_ACCESS_SECRET`, `ADMIN_PASSWORD` (encrypted),
  `CLIENT_ORIGIN`, `APP_URL`, `ADMIN_USERNAME`, `ADMIN_EMAIL`.

## Common tasks

**Admin login:** username `admin`. The password is in Parameter Store: open
`/pulse/ADMIN_PASSWORD` in the AWS console (ap-south-1) and click *Show decrypted value*.

**Deploy new API code:** push to the branch, then on the instance (Session Manager or Run Command):

```bash
sudo /opt/pulse/deploy/aws/start.sh   # git pull, refresh .env from Parameter Store, rebuild, restart
```

The same command applies changed `/pulse/*` settings.

**Deploy new frontend code:** Vercel builds every push. Pushes to `main` go to production; pushes to
other branches get a preview URL. To point the live site at another commit, redeploy it as Production
from the Vercel dashboard.

**Password-reset emails:** add `/pulse/SMTP_HOST`, `/pulse/SMTP_USER`, `/pulse/SMTP_PASS` (SecureString)
and optionally `/pulse/SMTP_PORT` / `/pulse/MAIL_FROM`, then run `start.sh`. Until then, reset links
appear in the API logs: `cd /opt/pulse/deploy/aws && sudo docker compose logs server`.

**Sign in with Google:** create a parameter `/pulse/GOOGLE_CLIENT_ID` (type String) with the OAuth
client id, then run `start.sh`. The button appears on the login page without a frontend rebuild.

**Save credits:** stop the instance in the EC2 console when you don't need it. The Elastic IP keeps
the same address, so starting it again needs no changes, and the containers restart automatically.
Running cost is about $20/month (t3.small plus the public IP).

**Remove everything:** terminate the instance, release the Elastic IP, delete the security group,
the `pulse-ec2-role` role/instance profile and the `/pulse/*` parameters, then delete the Vercel project.
