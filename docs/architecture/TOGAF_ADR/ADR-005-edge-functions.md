# ADR-005: Edge Functions vs Separate API Server

**Status:** Accepted
**Date:** 2025

## Context
Server-side logic needed for: AI proxy (hide API keys), cron jobs (morning briefing), webhooks (WhatsApp, Telegram), user management. Options: Express/Node API on Railway/Render, Supabase Edge Functions, AWS Lambda.

## Decision
Use Supabase Edge Functions (Deno runtime) for all server-side logic.

## Rationale
- **Co-located** — Same Supabase project as database; access to secrets, service_role
- **No separate hosting** — No additional server to manage/pay for
- **Cron support** — Built-in scheduling for morning-briefing, daily-report
- **CORS proxy** — claude-proxy solves browser CORS + hides API key

## Current Implementation
16 Edge Functions deployed:
- AI: claude-proxy, gemini-proxy, whatsapp-intelligence, report-narrative
- Cron: morning-briefing, daily-report, bypass-sla-checker, predictive-alerts, self-heal
- Webhooks: telegram-bot, whatsapp-notify
- Operations: factory-escalation, hse-escalation, approve-payroll, profit-share-calculator, manage-users

## Consequences
- (+) Zero infrastructure management beyond Supabase
- (+) Automatic HTTPS, cold start optimization
- (-) Deno runtime — no npm packages (must use esm.sh imports)
- (-) `_shared/` imports fail with Dashboard deploy (must inline shared code)
- (-) 50ms cold start on first invocation
- (-) 150s execution timeout (sufficient for current workloads)
