# BidFlow Deployment Guide — Render + MongoDB Atlas

Complete guide to deploy BidFlow on Render (free tier) with MongoDB Atlas (free tier).

**Estimated Cost: $0/month**

---

## Prerequisites

- GitHub account with BidFlow repository
- Render account (free): https://render.com
- MongoDB Atlas account (free): https://www.mongodb.com/atlas
- Redis account (free): https://upstash.com (for Celery task queue)

---

## Step 1: MongoDB Atlas Setup (Free Tier)

### 1.1 Create Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. Sign up / Log in
3. Click **"Build a Database"**
4. Select **M0 Sandbox** (Free tier, 512MB)
5. Choose cloud provider & region (closest to your users)
6. Click **"Create Cluster"**

### 1.2 Create Database User

1. In Atlas dashboard, go to **Database Access** (left sidebar)
2. Click **"Add New Database User"**
3. Set:
   - **Username**: `bidflow_user`
   - **Password**: (generate a strong password, save it)
   - **Role**: **Read and write to any database**
4. Click **"Add User"**

### 1.3 Whitelist IP Addresses

1. Go to **Network Access** (left sidebar)
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
4. Click **"Confirm"**

> **Note**: For production, restrict to Render's IP ranges. For free tier, `0.0.0.0/0` is acceptable.

### 1.4 Get Connection String

1. Go to **Database** (left sidebar)
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Copy the connection string (looks like):
   ```
   mongodb+srv://bidflow_user:<password>@cluster0.xxxxx.mongodb.net/bidflow?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Save this URI — you'll need it for Render

---

## Step 1.5: Redis Setup (Free Tier — Upstash)

Redis is required for Celery (background task queue for SLA checks and ML retraining).

### 1.5.1 Create Upstash Redis

1. Go to [Upstash](https://upstash.com)
2. Sign up / Log in (free tier: 10,000 commands/day)
3. Click **"Create Database"**
4. Choose:
   - **Name**: `bidflow-redis`
   - **Region**: Same as your MongoDB Atlas region
   - **Max. Write**: 10,000 commands/day (free tier)
5. Click **"Create"**
6. Copy the **REST URL** (looks like):
   ```
   redis://default:xxxxxx@xxxxx.upstash.io:6379
   ```
7. Save this URL — you'll need it for the Celery worker

---

## Step 2: Push Code to GitHub

Ensure your BidFlow code is pushed to GitHub:

```bash
git add -A
git commit -m "chore: add Render deployment configuration"
git push origin master
```

---

## Step 3: Deploy to Render

### 3.1 Connect GitHub Repository

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub account (if not already)
4. Select your BidFlow repository
5. Render will detect the `render.yaml` file automatically

### 3.2 Configure Environment Variables

Render will prompt you to set the following **secret** environment variables (values not shown in logs):

#### Backend (`bidflow-backend`):

| Variable | Value |
|----------|-------|
| `MONGO_URI` | Your Atlas connection string (from Step 1.4) |
| `MAIL_USERNAME` | Your Gmail address (for email verification) |
| `MAIL_PASSWORD` | Gmail App Password (16 chars) |
| `MAIL_DEFAULT_SENDER` | Same as MAIL_USERNAME |
| `GOOGLE_CLIENT_ID` | (Optional) Your Google OAuth client ID |
| `FRONTEND_URL` | Will be set after frontend deploys |
| `CORS_ALLOWED_ORIGINS` | Will be set after frontend deploys |

#### Celery Worker (`bidflow-celery`):

| Variable | Value |
|----------|-------|
| `MONGO_URI` | Same as backend |
| `REDIS_URL` | Your Upstash Redis URL (from Step 1.5.6) |

#### Frontend (`bidflow-frontend`):

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | Will be set after backend deploys |

### 3.3 Deploy

1. Click **"Apply"** to start deployment
2. Wait for all 3 services to deploy (5-10 minutes)
3. Once deployed, copy the URLs:
   - **Backend**: `https://bidflow-backend-xxxx.onrender.com`
   - **Frontend**: `https://bidflow-frontend-xxxx.onrender.com`

### 3.4 Update URLs

After deployment, update the environment variables:

1. Go to **bidflow-backend** → **Environment**
2. Set:
   - `FRONTEND_URL` = `https://bidflow-frontend-xxxx.onrender.com`
   - `CORS_ALLOWED_ORIGINS` = `https://bidflow-frontend-xxxx.onrender.com`
3. Click **"Save Changes"** (backend will redeploy)

4. Go to **bidflow-frontend** → **Environment**
5. Set:
   - `VITE_API_BASE_URL` = `https://bidflow-backend-xxxx.onrender.com`
6. Click **"Save Changes"** (frontend will redeploy)

### 3.5 Initialize Database Indexes

On first deploy, indexes need to be created. Trigger a backend restart:

1. Go to **bidflow-backend** → **Manual Deploy**
2. Click **"Deploy latest commit"**
3. Check logs for "Schema validation applied" messages

---

## Step 4: Verify Deployment

### 4.1 Test Backend Health

Visit: `https://bidflow-backend-xxxx.onrender.com/api/health`

Expected response:
```json
{"status": "healthy", "version": "1.0.0"}
```

### 4.2 Test Frontend

Visit: `https://bidflow-frontend-xxxx.onrender.com`

You should see the BidFlow login page.

### 4.3 Test Registration

1. Click **"Register"**
2. Fill in the form
3. You should receive a verification email (if SMTP is configured)
4. Verify your account and log in

---

## Step 5: Custom Domain (Optional)

### Backend

1. Go to **bidflow-backend** → **Settings**
2. Scroll to **"Custom Domain"**
3. Click **"Add Custom Domain"**
4. Enter: `api.yourdomain.com`
5. Follow DNS instructions (add CNAME record)

### Frontend

1. Go to **bidflow-frontend** → **Settings**
2. Scroll to **"Custom Domain"**
3. Click **"Add Custom Domain"**
4. Enter: `app.yourdomain.com`
5. Follow DNS instructions

---

## Troubleshooting

### Backend fails to start

**Error**: "Refusing to start: secrets are missing or weak"

**Solution**: Ensure all required environment variables are set in Render dashboard:
- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `EMAIL_TOKEN_SECRET`

### MongoDB connection timeout

**Error**: "Could not connect to MongoDB"

**Solution**:
1. Check Atlas IP whitelist includes `0.0.0.0/0`
2. Verify `MONGO_URI` is correct (no typos)
3. Check Atlas cluster is running

### Cold start delays (30-60 seconds)

**Expected behavior**: Render free tier spins down after 15 minutes of inactivity.

**Solutions**:
- Upgrade to Render paid plan ($7/month) for always-on
- Use a service like [UptimeRobot](https://uptimerobot.com) to ping your backend every 10 minutes

### File uploads not persisting

**Expected behavior**: Render's filesystem is ephemeral. Uploaded files are lost on redeploy.

**Solutions**:
- Use cloud storage (AWS S3, Cloudflare R2) for production
- For demo purposes, files persist until redeploy

### Email verification not working

**Solution**:
1. Check `MAIL_USERNAME` and `MAIL_PASSWORD` are set correctly
2. For Gmail, use an **App Password** (not your regular password)
3. Check Render logs for SMTP errors

### Celery worker can't connect to Redis

**Error**: "ConnectionError: Error connecting to ..."

**Solution**:
1. Verify `REDIS_URL` is set correctly in Render dashboard
2. For Upstash, ensure the URL format is `redis://default:password@host:port`
3. Check Upstash dashboard — free tier has 10,000 commands/day limit
4. If using Docker Compose locally, ensure Redis container is running: `docker compose up -d redis`

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Render Backend | Free | $0 |
| Render Celery | Free | $0 |
| Render Frontend | Free | $0 |
| MongoDB Atlas | M0 Sandbox (512MB) | $0 |
| Upstash Redis | Free (10K cmds/day) | $0 |
| **Total** | | **$0/month** |

---

## Limitations of Free Tier

- **Backend spins down** after 15 min idle (30-60s cold start)
- **512MB MongoDB** storage limit
- **512MB RAM** per Render service
- **100 GB/month** bandwidth limit
- **Ephemeral filesystem** — uploaded files lost on redeploy

---

## Production Upgrades (Optional)

If you need to upgrade for production use:

| Upgrade | Cost | Benefit |
|---------|------|---------|
| Render Starter Plan | $7/month | Always-on backend, 512MB RAM |
| MongoDB Atlas M10 | $57/month | 10GB storage, backups, monitoring |
| Upstash Redis Pro | $10/month | 100K commands/day, persistence |
| Cloudflare R2 | Free tier | Persistent file storage |
| Custom Domain | ~$10/year | Professional URL |

---

## Support

- Render Docs: https://render.com/docs
- MongoDB Atlas Docs: https://www.mongodb.com/docs/atlas/
- BidFlow Issues: https://github.com/ShivamKumar-666/bidflow/issues
