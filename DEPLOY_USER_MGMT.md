# User Management Fix — Deployment Guide

**Sprint:** BUG-1 / Sprint 39
**Date:** 2026-05-22
**Files changed:** `App.tsx`, `modules/auth/LoginPage.tsx`, `modules/auth/UserAccessManager.tsx`, `modules/auth/adminAuthService.ts`, `supabase/functions/manage-users/index.ts`

---

## What Got Fixed

| # | Bug | Severity | Status |
|---|---|---|---|
| 1 | Routes had no `allowedModules` guard — URL typed directly bypassed RBAC | P1 — Security | ✅ Fixed (RouteAccessGuard in App.tsx) |
| 2 | `UserAccessManager` required selecting an HR Employee — couldn't add external users | P1 — UX | ✅ Fixed (new "Invite by Email" panel) |
| 3 | `createUser` was called without password → user couldn't login (OTP `shouldCreateUser:false` blocked them) | P1 — Workflow | ✅ Fixed (new `inviteUser` flow uses `inviteUserByEmail`) |
| 4 | LoginPage auto-created a `role:viewer` profile for any authenticated user — RBAC bypass | P1 — Security | ✅ Fixed (auto-create removed, signs them out) |
| 5 | No `invite_user` action in edge function | — | ✅ Fixed (added to `manage-users`) |

**Behavioral changes you must know:**
- **Empty `allowed_modules` = NO ACCESS** (previously: "all access"). Admin must explicitly tick modules.
- `super_admin`, `owner`, `hassan` roles always have full access regardless of `allowed_modules`.
- Login by an authenticated user whose `user_profiles` row is missing → auto sign-out + "Contact admin" message.

---

## Deploy Steps

### 1. Deploy the updated edge function

```bash
cd C:/Users/PC
npx supabase functions deploy manage-users
```

If you don't have Supabase CLI installed:
```bash
npm install -g supabase
npx supabase login
npx supabase link --project-ref wfytbcmazixddtwpbego
npx supabase functions deploy manage-users
```

### 2. Verify Supabase Auth email template

Supabase Dashboard → Authentication → Email Templates → **Invite user**

Make sure the template uses the magic link `{{ .ConfirmationURL }}` and points to your production URL. If the redirect URL is missing, set:
- Dashboard → Authentication → URL Configuration → Site URL: `https://your-deployed-site/`
- Add `https://your-deployed-site/*` to redirect allow-list.

### 3. Rebuild and redeploy the front-end

```bash
cd C:/Users/PC
npm run build
# then deploy via Vercel (auto on push to main)
```

### 4. Verify existing 2 users still work

Important — empty `allowed_modules` now means no access. Run this SQL in Supabase to confirm both current users have full access:

```sql
SELECT id, email, role, allowed_modules, is_active
FROM user_profiles
ORDER BY created_at DESC;
```

If any non-`super_admin`/`owner`/`hassan` user has `allowed_modules = []`, they will hit "Access Denied" on every module. Either:
- Change their role to `super_admin` / `owner` / `hassan`, OR
- Update their `allowed_modules` to the list they actually need.

---

## How To Add a New User (Post-Fix)

1. Login as `super_admin` (Hassan)
2. Go to **/#/admin** → **Users** tab
3. Click **Invite by Email** (green button)
4. Fill the form:
   - Email
   - Full name
   - Role (pick from the list)
   - Tick the companies they need
   - **Tick every module they need access to** (empty = Dashboard only!)
   - Optional: enable Office Hours restriction
5. Click **Send Invite**
6. The user receives a Supabase signup email — they click the magic link → land in ERP → done
7. Next time, they login by entering their email → 6-digit OTP arrives → enter OTP → in

---

## Quick Smoke Test

After deploy, run these manually:

| # | Test | Expected |
|---|---|---|
| T1 | Login as a user with `allowed_modules: ['sales']` and try `/#/accounts` | "Access Denied" screen |
| T2 | Same user clicks Sidebar — only Sales shows | ✅ |
| T3 | Super admin invites `test@example.com` with `allowed_modules: []` | Invite email sent |
| T4 | New user clicks invite, lands on Dashboard. Tries `/#/sales` | "Access Denied" |
| T5 | Super admin edits the new user, ticks `sales` | New user can now access `/#/sales` |
| T6 | Old session of a deleted user — try to login with OTP | "Access nahi mila" + auto sign-out |

---

## Rollback (if something breaks)

```bash
cd C:/Users/PC
git revert HEAD
git push
```

Then redeploy `manage-users` from previous git history (the `invite_user` action is additive — removing it won't break existing callers).
