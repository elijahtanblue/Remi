# Remi

Remi is a Slack-first operational memory layer that links Slack threads to Jira issues, stores raw event history, generates deterministic handoff summaries, and surfaces them in Slack and Jira.

> Like the rat chef — working behind the scenes so your team stays coordinated.

---

## What it does

1. A user runs `/link-ticket PROJ-123` inside a Slack thread
2. Remi links that thread to the Jira issue and backfills history from both sides
3. When the Jira issue changes (status, assignee, priority) or new messages arrive in the linked thread, Remi regenerates a summary
4. The summary surfaces via `/brief PROJ-123`, Slack App Home, or an embedded Jira issue panel
5. Summaries are deterministic — no LLM, fully explainable, fully auditable

---

## What you'll need

- A **Slack workspace** where you're an admin
- A **Jira Cloud** account where you're an admin
- A **GitHub account** (free) — to store your code and run automated deploys
- An **AWS account** (free to create) — to host the server and database
- A computer running macOS, Linux, or Windows with WSL2

You don't need any prior experience with AWS, Docker, or cloud hosting. Each step below tells you exactly where to run each command.

---

## Part 1: Try it on your computer

This section lets you run Remi locally for testing before deploying to AWS.

### Prerequisites

- Node.js 20+ — download from [nodejs.org](https://nodejs.org)
- pnpm 9+ — run `npm install -g pnpm` after installing Node
- Docker Desktop — download from [docker.com](https://www.docker.com/products/docker-desktop)

### 1. Install dependencies

> **Your computer's terminal**

```bash
pnpm install
```

### 2. Start the local database

> **Your computer's terminal**

```bash
docker compose up -d
```

This starts a local Postgres database inside Docker. It runs in the background.

### 3. Set up your config file

> **Your computer's terminal**

```bash
cp .env.example .env
```

Open the new `.env` file in a text editor and fill in at minimum:
- `SLACK_BOT_TOKEN` — from your Slack app's OAuth page
- `SLACK_SIGNING_SECRET` — from Slack app Basic Information
- `SLACK_APP_TOKEN` — needed for Socket Mode (starts with `xapp-`)
- Leave `DATABASE_URL` as-is (points to your Docker Postgres)
- Leave `QUEUE_ADAPTER=memory` and `STORAGE_ADAPTER=local`

### 4. Set up the database tables

> **Your computer's terminal**

```bash
pnpm db:push    # create tables
pnpm db:seed    # add demo data
```

### 5. Start everything

> **Your computer's terminal**

```bash
pnpm dev
```

- API: `http://localhost:3000`
- Admin dashboard: `http://localhost:3001`
- Worker runs in the background consuming the in-memory queue

### 6. Set up the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Enable **Socket Mode** (under Settings → Socket Mode)
3. Under **OAuth & Permissions** → Bot Token Scopes, add:
   `channels:history`, `channels:read`, `chat:write`, `commands`, `im:write`, `users:read`
4. Under **Slash Commands**, add: `/link-ticket` and `/brief`
5. Under **Event Subscriptions**, add events: `message.channels`, `app_home_opened`
6. Under **Interactivity & Shortcuts**, add a message shortcut with Callback ID: `attach_to_issue`
7. Copy the **Bot Token**, **Signing Secret**, and **App Token** into your `.env`

Socket Mode means no public URL is needed for local development.

### 7. Set up Jira (optional — requires a public URL)

Jira webhooks need a publicly reachable URL. For local testing, use ngrok:

> **Your computer's terminal**

```bash
npx ngrok http 3000
```

Set `BASE_URL` in `.env` to your ngrok URL (e.g. `https://abc123.ngrok.io`), then install the Jira Connect app from:

```
https://your-ngrok-url.ngrok.io/jira/atlassian-connect.json
```

---

## Part 2: Deploy to AWS

> These instructions are written for someone who has never used AWS before. Take your time — each step tells you exactly where to run the command.

---

### What this will cost

AWS has a free tier that covers everything you need for 12 months (and some things are free forever).

| Service | What it's used for | Free tier | After free tier |
|---|---|---|---|
| EC2 t2.micro | Your server (runs all 3 apps) | 750 hrs/month, 12 months | ~$9/month |
| RDS db.t3.micro | PostgreSQL database | 750 hrs/month + 20GB, 12 months | ~$15/month |
| SQS | Message queues (4 queues) | 1 million messages/month, **forever** | Fractions of a cent |
| S3 | Store raw event payloads | 5GB storage, 12 months | < $1/month |
| SSM Parameter Store | Store secrets securely | **Free forever** | Free |
| IAM | User permissions | **Free forever** | Free |

**During the first 12 months: $0.** After that: ~$25–30/month total.

> **Important:** Do NOT enable "Multi-AZ" on RDS — that doubles the cost. Single-AZ is fine for this use case.

---

### Step 1: Create an AWS account

> **Your web browser**

1. Go to [aws.amazon.com](https://aws.amazon.com) → **Create an AWS Account**
2. Follow the prompts — you'll need a credit card, but you won't be charged during the free tier period
3. Once created, sign in to the **AWS Console** (the web dashboard)

---

### Step 2: Create a deploy user (IAM)

You'll create a user that has permission to create AWS resources. This keeps your main account credentials safe.

> **AWS Console → Search for "IAM" in the top search bar**

1. Click **Users** in the left sidebar → **Create user**
2. Username: `remi-deploy`
3. Select **Attach policies directly**
4. Search for and check these policies:
   - `AmazonRDSFullAccess`
   - `AmazonSQSFullAccess`
   - `AmazonS3FullAccess`
   - `AmazonSSMFullAccess`
   - `AmazonEC2FullAccess`
5. Click **Create user**
6. Click the user you just created → **Security credentials** tab → **Create access key**
7. Choose **Command Line Interface (CLI)** → click through to create
8. **Download the CSV file** — save it somewhere safe. You'll need the Access Key ID and Secret Access Key.

---

### Step 3: Install the AWS tool on your computer

> **Your computer's terminal**

**macOS:**
```bash
brew install awscli
```

**Windows (in WSL2 or Git Bash):**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install
```

**Verify it worked:**
```bash
aws --version
```

Now connect the tool to your AWS account:

```bash
aws configure
```

Enter the values from the CSV file you downloaded in Step 2:
```
AWS Access Key ID: [paste from CSV]
AWS Secret Access Key: [paste from CSV]
Default region name: us-east-1
Default output format: json
```

---

### Step 4: Create the database (RDS)

> **AWS Console → Search for "RDS"**

1. Click **Create database**
2. Choose **Standard Create**
3. Engine: **PostgreSQL**
4. Templates: **Free tier**
5. DB instance identifier: `remi-prod`
6. Master username: `remi`
7. Master password: choose a strong password and **write it down**
8. Instance configuration: confirm it shows `db.t3.micro` (free tier)
9. Storage: 20 GB (default)
10. **Connectivity**: set "Public access" to **Yes** temporarily (you'll lock this down later)
11. Under **Additional configuration**, set Initial database name: `remi`
12. Click **Create database** — this takes 5–10 minutes

Once created, click the database → note the **Endpoint** (it looks like `remi-prod.xxxxxxxxx.us-east-1.rds.amazonaws.com`).

Your database connection string will be:
```
postgresql://remi:YOUR_PASSWORD@remi-prod.xxxxxxxxx.us-east-1.rds.amazonaws.com:5432/remi
```

> **Security note:** After setting up, you can make RDS private by setting "Public access" to No and only allowing access from your EC2 instance's security group.

---

### Step 5: Create the message queues (SQS)

> **Your computer's terminal**

Run these commands to create the 4 queues Remi uses:

```bash
for queue in slack-events jira-events summary-jobs backfill-jobs; do
  aws sqs create-queue \
    --queue-name "remi-${queue}.fifo" \
    --attributes FifoQueue=true,ContentBasedDeduplication=true \
    --region us-east-1
done
```

Each command prints a URL — **copy all 4 URLs** and save them. They look like:
```
https://sqs.us-east-1.amazonaws.com/123456789012/remi-slack-events.fifo
```

---

### Step 6: Create file storage (S3)

> **Your computer's terminal**

Replace `your-name` with something unique (bucket names must be globally unique):

```bash
aws s3api create-bucket \
  --bucket remi-payloads-your-name \
  --region us-east-1

# Block all public access (keeps your data private)
aws s3api put-public-access-block \
  --bucket remi-payloads-your-name \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

Save the bucket name — you'll need it later.

---

### Step 7: Create your server (EC2)

> **AWS Console → Search for "EC2"**

1. Click **Launch instance**
2. Name: `remi-server`
3. AMI (operating system): **Amazon Linux 2023** (selected by default)
4. Instance type: **t2.micro** (shows "Free tier eligible")
5. Key pair: click **Create new key pair**
   - Name: `remi-key`
   - Type: RSA
   - Format: `.pem`
   - Click **Create key pair** — a file called `remi-key.pem` will download automatically
   - **Keep this file safe** — you'll need it to connect to your server
6. Network settings → Edit:
   - Add a rule: Type **Custom TCP**, Port **3000**, Source **0.0.0.0/0** (the API)
   - Add a rule: Type **Custom TCP**, Port **3001**, Source **0.0.0.0/0** (the admin dashboard)
   - SSH (port 22) is already there — change Source to **My IP** for security
7. Click **Launch instance**

Once launched, click the instance → note the **Public IPv4 address** (e.g. `54.123.45.67`).

---

### Step 8: Set up your server

Now you'll SSH (remotely log in) to your new server and install Docker.

> **Your computer's terminal**

First, move your key file somewhere safe and set the right permissions:

```bash
# Move the key to your home directory (adjust path to where it downloaded)
mv ~/Downloads/remi-key.pem ~/.ssh/remi-key.pem
chmod 400 ~/.ssh/remi-key.pem
```

Connect to the server (replace `YOUR_EC2_IP` with the public IP from the AWS Console):

```bash
ssh -i ~/.ssh/remi-key.pem ec2-user@YOUR_EC2_IP
```

You should see a command prompt that says `[ec2-user@ip-... ~]$`. You're now inside your server.

> **From this point, run the following commands inside the server terminal (the SSH session):**

```bash
# Update the system
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker

# Allow your user to run Docker without sudo
sudo usermod -aG docker ec2-user

# Install Docker Compose v2 plugin (allows "docker compose" with a space)
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# Install git
sudo yum install -y git

# Add swap space (prevents crashes when memory is tight)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab

# Log out and back in so group changes take effect
exit
```

> **Your computer's terminal** — reconnect:

```bash
ssh -i ~/.ssh/remi-key.pem ec2-user@YOUR_EC2_IP
```

---

### Step 9: Put your secrets on the server

Still inside the server terminal, create an environment file with all your configuration:

> **Server terminal (SSH session)**

```bash
nano ~/.env.prod
```

This opens a text editor. Paste the following and fill in every value (see the table below for where to find each one):

```bash
# Database
DATABASE_URL=postgresql://remi:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/remi

# Node
NODE_ENV=production

# Queue (SQS)
QUEUE_ADAPTER=sqs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
SLACK_EVENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-slack-events.fifo
JIRA_EVENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-jira-events.fifo
SUMMARY_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-summary-jobs.fifo
BACKFILL_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-backfill-jobs.fifo

# Storage (S3)
STORAGE_ADAPTER=s3
AWS_S3_BUCKET=remi-payloads-your-name

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SOCKET_MODE=false

# API
PORT=3000
BASE_URL=http://YOUR_EC2_IP:3000
ADMIN_API_KEY=GENERATE_A_LONG_RANDOM_STRING_HERE

# Admin dashboard
NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3000
```

**To save and exit nano:** press `Ctrl+X`, then `Y`, then `Enter`.

**Where to find each value:**

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Your RDS endpoint from Step 4 + the password you chose |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | The CSV you downloaded in Step 2 |
| `SLACK_EVENTS_QUEUE_URL` etc. | The 4 URLs printed in Step 5 |
| `AWS_S3_BUCKET` | The bucket name you chose in Step 6 |
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information → Signing Secret |
| `ADMIN_API_KEY` | Make up a random password (run `openssl rand -hex 32` to generate one) |
| `BASE_URL` | `http://` + your EC2 public IP + `:3000` |

---

### Step 10: Create a GitHub token for pulling images

Docker images are stored on GitHub's container registry (GHCR) — free for all GitHub accounts. You need a token so your server and GitHub Actions can pull images.

> **Your web browser**

1. Go to **github.com → your profile picture (top right) → Settings**
2. Scroll down the left sidebar and click **Developer settings**
3. Click **Personal access tokens** in the left sidebar — it will expand
4. Click **Tokens (classic)** — not "Fine-grained tokens" (that page shows "Repository access" and won't have the option you need)
5. Click **Generate new token (classic)**
6. Fill in:
   - Note: `remi-ghcr`
   - Expiration: No expiration (or 1 year)
   - Scopes: scroll down and check **`read:packages`** (just this one)
7. Click **Generate token** at the bottom
8. **Copy the token immediately** — GitHub only shows it once. Save it somewhere safe; you'll need it in Steps 11 and 15.

---

### Step 11: Deploy Remi for the first time

**Before running these commands,** push your code to GitHub first. GitHub Actions will build the Docker images automatically when you push. The server needs those images to exist before it can pull them.

> **Your computer's terminal**

```bash
git remote add origin https://github.com/YOUR_USERNAME/remi.git
git push -u origin main
```

Check the **Actions** tab in your GitHub repo. You'll see three build jobs running (api, worker, admin) — wait for all three to show a green checkmark. This takes 5–10 minutes on the first run.

> **Note:** A fourth job called "Deploy" will fail on this first push — that's expected, because you haven't added the EC2 secrets yet (that's Step 15). The three build jobs are all that matters here; once they're green, the images are ready on GHCR.

Now set up the server:

> **Server terminal (SSH session)**

```bash
# Clone your repo
git clone https://github.com/YOUR_USERNAME/remi.git ~/remi
cd ~/remi

# Copy your secrets file into the project
cp ~/.env.prod .env.prod

# Create the compose variable file (separate from .env.prod — this is for Docker Compose itself)
echo "GHCR_IMAGE_PREFIX=ghcr.io/YOUR_GITHUB_USERNAME" > .env

# Log in to GHCR with the token from Step 10
echo "YOUR_GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull images
docker compose -f docker-compose.prod.yml pull

# Apply database schema
docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @remi/db db:migrate:prod

# Start all 3 services
docker compose -f docker-compose.prod.yml up -d
```

> **Note:** After this first setup, GitHub Actions handles all future deploys automatically on every push to `main`.

Check that everything is running:

```bash
docker compose -f docker-compose.prod.yml ps
```

You should see `api`, `admin`, and `worker` all showing as `Up`.

Test it in your browser:
- API: `http://YOUR_EC2_IP:3000/health`
- Admin dashboard: `http://YOUR_EC2_IP:3001`

---

### Step 12: Connect Slack to your live server

Now you'll point your Slack app at your real server instead of your laptop.

> **Your web browser → [api.slack.com/apps](https://api.slack.com/apps)**

1. Click your app → **Event Subscriptions** → turn on Events
2. Set **Request URL** to: `http://YOUR_EC2_IP:3000/slack/events`
3. Under **Subscribe to bot events**, add: `message.channels`, `app_home_opened`
4. Save changes

5. Click **Slash Commands** → edit each command:
   - `/link-ticket` → Request URL: `http://YOUR_EC2_IP:3000/slack/commands`
   - `/brief` → Request URL: `http://YOUR_EC2_IP:3000/slack/commands`

6. Click **Interactivity & Shortcuts** → turn on Interactivity
   - Request URL: `http://YOUR_EC2_IP:3000/slack/interactions`

7. Click **Socket Mode** → **Disable Socket Mode** (you have a real URL now)

8. Click **Install to Workspace** (or reinstall if already installed)

---

### Step 13: Connect Jira to your live server

> **Your Jira Cloud account → Settings (gear icon) → Apps → Manage apps**

1. Click **Upload app**
2. Enter this URL (replace with your EC2 IP):
   ```
   http://YOUR_EC2_IP:3000/jira/atlassian-connect.json
   ```
3. Click **Upload**

Remi should now appear as an installed app in Jira and show a panel on your issues.

---

### (Optional) Step 14: Set up a domain name and HTTPS

Using an IP address works but isn't ideal. If you have a domain name, you can set it up with free HTTPS using Caddy:

> **Server terminal (SSH session)**

```bash
# Install Caddy
sudo yum install -y caddy

# Create a simple Caddy config (replace yourdomain.com with your actual domain)
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
api.yourdomain.com {
    reverse_proxy localhost:3000
}

admin.yourdomain.com {
    reverse_proxy localhost:3001
}
EOF

sudo systemctl enable caddy
sudo systemctl start caddy
```

Then point your domain's DNS A records at your EC2 IP address, and Caddy handles the HTTPS certificate automatically.

Update `BASE_URL` in your `.env.prod` to use `https://api.yourdomain.com`, restart the containers:

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

### (Optional) Step 15: Auto-deploy when you push code

GitHub Actions builds your Docker images and deploys them to EC2 automatically on every push to `main`. The workflow file is already in the repo at [.github/workflows/deploy.yml](.github/workflows/deploy.yml). You just need to add secrets.

> **GitHub → Your repo → Settings → Secrets and variables → Actions → New repository secret**

Add these three secrets:

| Secret name | Value |
|---|---|
| `EC2_HOST` | Your EC2 public IP address |
| `EC2_SSH_KEY` | Full contents of `~/.ssh/remi-key.pem` (open the file, copy everything including the `-----BEGIN` and `-----END` lines) |
| `GHCR_PAT` | The GitHub token you created in Step 10 |

> **Important:** The `GHCR_PAT` must be a token created by the **repository owner** (the GitHub account that owns the repo). The deploy workflow logs into GHCR as the repository owner using this token. If someone else created the token, the login will fail.

The workflow uses `GHCR_PAT` to log your EC2 server into GHCR on every deploy, and `GITHUB_TOKEN` automatically for the image build steps.

**How it works:**

1. You push code to `main`
2. GitHub Actions builds all 3 Docker images in parallel (free on GitHub-hosted runners)
3. Images are pushed to GHCR under your account
4. GitHub Actions SSHs into your EC2 server and runs `docker compose pull && up -d`
5. Your server pulls the new images and restarts — zero downtime for the other services

Each build after the first is fast because GitHub Actions caches Docker layers between runs.

---

## Monorepo structure

```
apps/
  api/        Fastify API server (Slack + Jira webhooks, admin)
  worker/     SQS consumer for async processing
  admin/      Next.js ops dashboard

packages/
  shared/         Types, schemas, constants, errors
  db/             Prisma schema + client + repositories
  queue/          Queue abstraction (SQS in prod, in-memory in dev)
  storage/        Storage abstraction (S3 in prod, local files in dev)
  slack/          Slack Bolt handlers, commands, views
  jira/           Jira Connect auth, REST client, webhook parser, panel
  summary-engine/ Deterministic summary generation (no LLM)
```

---

## Admin dashboard

Visit `http://YOUR_EC2_IP:3001` once the app is running.

The admin dashboard shows:
- All workspaces and their Slack/Jira install status
- Recent issue-thread links
- Summary history with completeness scores and re-run button
- Failed jobs (dead letters) with retry button
- Audit log of all actions

---

## Summary engine

Summaries are generated by `packages/summary-engine` — purely rules-based, no LLM required.

The engine:
1. Collects current issue state + all events from Postgres
2. Collects all messages from linked Slack threads
3. Runs analyzers: status drift, blocker detection (keyword scan), open question detection, ownership analysis
4. Scores completeness (0–100) and picks a recommended next step
5. Persists the typed output as a new `Summary` row, superseding the previous version

Summaries regenerate on: status change, assignee change, priority change, new linked Slack messages, or manual `/brief --refresh`.

---

## Key design decisions

**Raw-first storage** — Every Slack message and Jira webhook is stored verbatim before any processing. Summaries are always regeneratable from raw data.

**Explicit linking only** — No auto-inference. Users must run `/link-ticket` to create a link. This keeps the mental model clean and avoids false positives.

**Deterministic summaries** — Pattern matching, keyword detection, and scoring heuristics. Predictable output, no API cost, no hallucination risk. LLM enrichment can be layered in later without changing the data model.

**Queue abstraction** — `IQueueProducer`/`IQueueConsumer` interfaces allow swapping SQS for in-memory in dev with no code changes.

**Workspace-scoped multi-tenancy** — Every table has a `workspaceId` FK. No schema-per-tenant complexity.

**Jira Connect (not Forge)** — Full control over hosting, webhooks, and iframe panels.

---

## Full environment variable reference

```bash
# ─── Database ───────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/remi

# ─── Node ───────────────────────────────────────────────────────────────────
NODE_ENV=production

# ─── Queue (SQS) ────────────────────────────────────────────────────────────
QUEUE_ADAPTER=sqs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SLACK_EVENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-slack-events.fifo
JIRA_EVENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-jira-events.fifo
SUMMARY_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-summary-jobs.fifo
BACKFILL_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/remi-backfill-jobs.fifo

# ─── Storage (S3) ───────────────────────────────────────────────────────────
STORAGE_ADAPTER=s3
AWS_S3_BUCKET=remi-payloads-prod

# ─── Slack ──────────────────────────────────────────────────────────────────
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SOCKET_MODE=false
# SLACK_APP_TOKEN only needed in dev Socket Mode

# ─── API ────────────────────────────────────────────────────────────────────
PORT=3000
BASE_URL=https://your-domain.com
ADMIN_API_KEY=<64-char random string>

# ─── Admin dashboard ────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://your-domain.com
ADMIN_API_KEY=<same as above>
```

---

## Future integrations

The connector architecture (Workspace → `*Install`) is designed to extend to:
- Gmail / Outlook (email connectors)
- Confluence / Notion (docs)
- Linear, GitHub Issues
- LLM-based summary rewriting (drop-in replacement for `packages/summary-engine`)
- Role-based permissions
- Atlassian Marketplace listing
