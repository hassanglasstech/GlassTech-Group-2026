# ADR-004: Real-time Subscriptions for Notifications

**Status:** Partially Implemented
**Date:** 2025

## Context
Factory floor needs live updates: piece status changes, escalation alerts, WhatsApp messages. Options: polling, WebSocket, Supabase Realtime, Server-Sent Events.

## Decision
Use Supabase Realtime (PostgreSQL LISTEN/NOTIFY over WebSocket) with localStorage as offline fallback.

## Rationale
- **Built-in** — Supabase provides realtime subscriptions out of the box
- **Row-level filtering** — Can subscribe to `factory_events` WHERE `priority = 'Urgent'`
- **Offline resilience** — localStorage persists data when WebSocket disconnects

## Current Implementation
- `RealtimeService.ts` exists (16.5 KB) but currently **unused** by agent system
- `SyncService.ts` handles localStorage ↔ Supabase background sync
- Agent system uses polling (manual refresh button in AIChatInterface)
- Morning briefing uses cron (not realtime)

## Consequences
- (+) Infrastructure ready for realtime factory dashboard
- (-) Currently unused — opportunity to enable for factory_events, escalations
- (-) Realtime adds connection overhead per client
