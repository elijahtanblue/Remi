# Remi Deployment Log

Running log of every issue hit and fix applied while deploying Remi to production with the `memoremi.com` domain. Use this as a troubleshooting reference for future deployments.

---

## Domain Setup (memoremi.com)

### DNS — Cloudflare
- Created two A records: `api.memoremi.com` and `admin.memoremi.com` both pointing to the EC2 public IP (`3.107.15.249`)
- **Important:** Set proxy status to **DNS only (grey cloud)**, NOT proxied (orange cloud). Cloudflare proxy mode breaks Caddy's Let's Encrypt certificate provisioning.

### EC2 Security Group
- Added inbound rules for **HTTP port 80** and **HTTPS port 443** (both `0.0.0.0/0`)
- Ports 3000 and 3001 remain open but can be restricted to localhost once Caddy is running

---

## Caddy (Reverse Proxy + HTTPS)

### Problem: `sudo yum install -y caddy` fails
```
Error: Unable to find a match: caddy
```
Caddy is not in the default Amazon Linux 2023 repos.

**Attempted fix:** Add Cloudsmith repo via `curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.rpm.sh' | sudo -E bash`
**Result:** Repo added OK but `dnf install caddy` still failed — no package available for `amzn/2023`.

### Fix: Run Caddy as a Docker container
Since Docker is already installed on the EC2 instance, run Caddy via Docker using host networking:

```bash
sudo mkdir -p /etc/caddy
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
api.memoremi.com {
    reverse_proxy localhost:3000
}

admin.memoremi.com {
    reverse_proxy localhost:3001
}
EOF

docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:latest
```

`--network host` is required so Caddy can reach `localhost:3000` and `localhost:3001` (the app containers).

---

## API Container (remi-api)

### Problem: API keeps restarting — `FST_ERR_CTP_ALREADY_PRESENT`
```
FastifyError: Content type parser 'application/x-www-form-urlencoded' already present.
  at slackRoutes → apps/api/src/routes/slack/index.ts
```
Fastify v5 has a built-in parser for `application/x-www-form-urlencoded`. The Slack routes were registering it again, throwing on startup.

**Fix:** `apps/api/src/routes/slack/index.ts` — remove the parsers before adding them:
```typescript
app.removeContentTypeParser(['application/json', 'application/x-www-form-urlencoded']);
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, body));
```

---

## Admin Container (remi-admin)

### Problem: Admin shows `unhealthy` — wrong port mapping
`docker-compose.prod.yml` had `ports: "3001:3001"` and health check on `localhost:3001`, but Next.js runs on port 3000 inside the container (because `.env.prod` sets `PORT=3000` which overrides the Dockerfile's `ENV PORT=3001`).

**Fix:** `docker-compose.prod.yml`:
```yaml
ports:
  - "3001:3000"   # host:container
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:3000"]
```

### Problem: Admin still `unhealthy` — Next.js binds to container hostname, not localhost
Health check passed correctly but `wget localhost:3000` inside the container returned "Connection refused". The Next.js standalone server reads the `HOSTNAME` env var and binds only to that interface (the container hostname), not `0.0.0.0`.

**Fix:** Add `HOSTNAME=0.0.0.0` to the admin service in `docker-compose.prod.yml`:
```yaml
admin:
  environment:
    - HOSTNAME=0.0.0.0
```

---

## Disk Space

### Problem: Deploy fails with `no space left on device`
The EC2 t2.micro default 8GB root volume filled up with Docker image layers.

**Fix:** Clean up unused Docker images/containers:
```bash
docker system prune -a --volumes -f
```

**Long-term fix:** Expand the EBS volume in AWS Console → EC2 → Volumes → Modify Volume (increase to 20GB), then on the server:
```bash
sudo growpart /dev/xvda 1
sudo xfs_growfs /
```

---

## Database

### Problem: `The table 'public.workspaces' does not exist`
Tables had never been created in the production RDS database.

**Root cause:** The project uses `prisma db push` (no migration files exist). The deploy workflow was incorrectly calling `db:migrate:prod` (`prisma migrate deploy`) which found no migration files and did nothing.

**Fix — run manually on first deploy:**
```bash
cd ~/remi
docker-compose -f docker-compose.prod.yml run --rm api pnpm --filter @remi/db db:push --accept-data-loss
```

**Fix — deploy workflow** (`.github/workflows/deploy.yml`): changed from `db:migrate:prod` to `db:push --accept-data-loss` so future deploys apply schema changes automatically.

---

## Workspace Bootstrap

### Problem: `{"workspaces":[]}` — no workspace exists after DB is created
There is no OAuth install flow. Workspaces are never auto-created. The `workspaceResolverMiddleware` only looks up existing workspaces — it does not create them. Opening the Slack App Home does not create a workspace either.

**Fix:** A `POST /admin/workspaces` bootstrap endpoint was added to `apps/api/src/routes/admin/index.ts`.

**One-time setup after first deploy:**

Step 1 — get your Slack team ID and bot user ID:
```bash
source ~/remi/.env.prod
curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" "https://slack.com/api/auth.test"
# note the "team_id" and "user_id" fields
```

Step 2 — create the workspace:
```bash
curl -s -X POST \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Remi",
    "slug": "remi",
    "slackTeamId": "T_YOUR_TEAM_ID",
    "slackTeamName": "Your Workspace Name",
    "botToken": "xoxb-your-token",
    "botUserId": "U_YOUR_BOT_USER_ID"
  }' \
  "https://api.memoremi.com/admin/workspaces"
```

Step 3 — note the `workspace.id` from the response. You'll need it for the Jira install.

---

## Jira Connect App

### Problem: "Something went wrong" when installing via descriptor URL
The descriptor URL `https://api.memoremi.com/jira/atlassian-connect.json` was pasted without a `workspaceId` query param. This caused the lifecycle `installed` callback to fire with `workspaceId=unknown`, which fails the DB foreign key constraint.

**Fix:** Install using the descriptor URL with the real workspace ID from the bootstrap step above:
```
https://api.memoremi.com/jira/atlassian-connect.json?workspaceId=<workspace.id>
```

Paste that full URL into the Jira **Install a private app → App descriptor URL** field.

> **Warning:** Atlassian ended Connect app installs via descriptor URL on **March 31, 2026**. This method only works for apps already installed before that date or in development mode. After that date, migration to Forge is required.

---

## Environment Variables (.env.prod)

Key production values:
```bash
BASE_URL=https://api.memoremi.com
NEXT_PUBLIC_API_URL=https://api.memoremi.com
API_URL=http://api:3000          # server-side only, uses Docker internal DNS
SLACK_SOCKET_MODE=false          # must be false in production (HTTP mode)
PORT=3000                        # used by API; admin inherits this but is overridden by HOSTNAME fix
HOSTNAME=0.0.0.0                 # set in docker-compose.prod.yml for admin, not .env.prod
```

---

## Slack App URLs (api.slack.com)

After domain is live, update these in the Slack app settings:

| Setting | URL |
|---|---|
| Event Subscriptions → Request URL | `https://api.memoremi.com/slack/events` |
| Slash Commands (`/link-ticket`, `/brief`) | `https://api.memoremi.com/slack/commands` |
| Interactivity & Shortcuts | `https://api.memoremi.com/slack/interactions` |

Disable **Socket Mode** after updating (Settings → Socket Mode → Disable).
