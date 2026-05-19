# Deployment Guide

## Two Environments

| | Local (Dev) | Production |
|---|---|---|
| **URL** | http://localhost:3000 | https://donatelo.vercel.app |
| **Database** | Supabase `khxndffnkaeecdmcwqzo` | Same Supabase project (shared) |
| **Config** | `.env.local` | Vercel Environment Variables |
| **How to run** | `bash pnpm.sh run dev` | Auto-deploys on `git push` |

> **Note:** Both environments use the same Supabase project. User data is isolated via
> Row Level Security (RLS) — each user sees only their own rows. This is safe and
> appropriate while the user base is small. To separate DB environments in the future,
> create a second Supabase project and update Vercel's env vars.

---

## Daily Development Workflow

### 1. Code changes only (no DB schema changes)

```bash
# Work locally
bash pnpm.sh run dev

# Test your changes at http://localhost:3000

# Commit and push → Vercel auto-deploys in ~2 minutes
git add <files>
git commit -m "feat: your description"
git push origin master
```

Vercel detects the push and automatically rebuilds + deploys. **No extra steps needed.**

### 2. Schema changes (new table, new column, migration)

Schema changes affect the database — you must apply them to production **before or together** with deploying the code that uses them.

```bash
# Step 1: Write the migration locally
bash pnpm.sh run db:migrate
# This creates a new file in prisma/migrations/

# Step 2: Test locally
bash pnpm.sh run dev

# Step 3: Apply the migration to production DB
set -a && source .env.local && set +a
bash pnpm.sh exec prisma migrate deploy

# Step 4: Push code → Vercel deploys
git add prisma/migrations/
git add <other changed files>
git commit -m "feat: your description"
git push origin master
```

> ⚠️ **Order matters:** Always run `prisma migrate deploy` (step 3) BEFORE or at the same
> time as `git push` (step 4). If code reaches production before the migration,
> the app will crash because it references columns that don't exist yet.

### 3. New RLS policy needed

If you add a new table with user data, add an RLS policy:

```bash
# Edit the RLS file
# File: prisma/rls-policies.sql

# Apply to the database
set -a && source .env.local && set +a
cat prisma/rls-policies.sql | bash pnpm.sh exec prisma db execute --stdin --schema prisma/schema.prisma
```

---

## Updating Environment Variables

### Add/change a variable in production

```bash
# Add a new variable
echo "your-value" | npx vercel env add VARIABLE_NAME production --token "<YOUR_VERCEL_TOKEN>" --yes

# Remove and re-add (to update a value)
npx vercel env rm VARIABLE_NAME production --token "<YOUR_VERCEL_TOKEN>" --yes
echo "new-value" | npx vercel env add VARIABLE_NAME production --token "<YOUR_VERCEL_TOKEN>" --yes

# After changing env vars, redeploy so they take effect
npx vercel deploy --prod --token "<YOUR_VERCEL_TOKEN>" --yes
```

### Add/change a variable locally

Edit `.env.local` directly. Restart `dev` server.

---

## Supabase Auth — Google OAuth Setup

For Google login to work on the production URL, add it to Supabase:

1. Go to [Supabase Dashboard → Authentication → URL Configuration](https://supabase.com/dashboard/project/khxndffnkaeecdmcwqzo/auth/url-configuration)
2. Add to **Redirect URLs**:
   ```
   https://donatelo.vercel.app/auth/callback
   ```
3. Also add your Google OAuth credentials in Supabase → Auth → Providers → Google
   (if not already done)

---

## Manual Deploy (without git push)

```bash
cd C:\Users\Avner\donatelo
npx vercel deploy --prod --token "<YOUR_VERCEL_TOKEN>" --yes
```

---

## Rollback

If a bad deployment reaches production:

```bash
# See recent deployments
npx vercel ls --token "<YOUR_VERCEL_TOKEN>"

# Promote a previous deployment to production
npx vercel promote <deployment-url> --token "<YOUR_VERCEL_TOKEN>"
```

Or via [Vercel Dashboard](https://vercel.com/avnamer-6447s-projects/donatelo) → Deployments → click any past deploy → "Promote to Production".

---

## Useful Links

| Resource | URL |
|---|---|
| Production app | https://donatelo.vercel.app |
| Vercel dashboard | https://vercel.com/avnamer-6447s-projects/donatelo |
| Supabase dashboard | https://supabase.com/dashboard/project/khxndffnkaeecdmcwqzo |
| Vercel deployments log | https://vercel.com/avnamer-6447s-projects/donatelo/deployments |
| GitHub repo | https://github.com/avnamer/Donatelo |
