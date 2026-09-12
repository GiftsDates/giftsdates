# GiftsDates PRD

## Problem statement
Build a dating platform "GiftsDates" with profile browsing by location, likes, 8-language UI (RU/EN/ES/FR/DE/PT/ZH/AR incl. RTL for Arabic), monthly premium subscription, coin wallet with Stripe top-up, and paid actions: gifts (30% commission → 70% to recipient's withdrawable balance), video calls (10 coins/min), and date bookings with escrow released 24h after photo-confirmation of the date. Withdrawals available from gifts + dates.

## Personas
- Suitor: buys coins, sends gifts, video-calls, books dates.
- Match: receives 70% of gift/videocall value, confirms dates with photo, withdraws earnings.

## Tech
- Backend: FastAPI + Motor (Mongo), JWT auth, Stripe (Emergent sandbox), Emergent Object Storage.
- Frontend: React 19, Tailwind, shadcn/ui, sonner toasts.

## Delivered (2026-02-12)
- Auth: register/login/me/patch (language persisted).
- Profiles: search+filters (name, city, country, age range, gender).
- Likes + reciprocal Matches + Conversation auto-created.
- Chat with message polling.
- Gifts: 6-tier catalog, 30% commission split, transactions ledger.
- Video calls: demo UI with mic/camera toggles + coin timer.
- Date booking: escrow → confirm-with-photo → release_at (+24h) → GET /dates auto-releases past due.
- Cancel returns escrow to booker.
- Wallet: coins / escrow / withdrawable, top-up modal, withdraw dialog (bank/card/crypto).
- Stripe checkout for coin packs + premium monthly (pass-through session + webhook idempotent fulfill).
- Object Storage-backed photo upload for date confirmation.
- 8-language i18n dictionary, RTL for Arabic.

## Backlog (P1)
- Real photo grid on profile edit page (upload multiple photos).
- Push/notification for match + gift received.
- Admin panel: catalog editing, withdrawal approvals.
- Real WebRTC video calls (Twilio/Agora).

## Backlog (P2)
- Boost placements for premium (top of search).
- Multi-currency withdraw display.
- Referral rewards.
