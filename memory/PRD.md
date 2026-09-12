# GiftsDates PRD

## Problem statement
Build a dating platform "GiftsDates" with profile browsing by location, likes, 8-language UI (RU/EN/ES/FR/DE/PT/ZH/AR incl. RTL for Arabic), monthly premium subscription, coin wallet with Stripe top-up, and paid actions: gifts, video calls (10 coins/min), and date bookings with escrow released 24h after photo-confirmation of the date. Withdrawals available from gifts + dates; bank account must be verified; 30% platform commission is withheld at withdrawal.

## Personas
- Suitor: buys coins, sends gifts, video-calls, books dates.
- Match: receives gift/videocall/date value into withdrawable balance, verifies bank account, withdraws (−30%).
- Admin (email in backend/.env ADMIN_EMAILS): verifies bank accounts, processes withdrawals at /admin.

## Tech
- Backend: FastAPI + Motor (Mongo), JWT auth, Stripe (Emergent sandbox), Emergent Object Storage.
- Frontend: React 19, Tailwind, shadcn/ui, sonner toasts. All UI strings in `src/lib/i18n.js`.

## Delivered
### 2026-02-12 (v1)
- Auth, profiles search, likes/matches, chat, gifts, demo video calls, date escrow (confirm w/ photo → +24h release), wallet, Stripe checkout, i18n + RTL.

### 2026-09-12 (v2)
- Multi-photo upload (max 6, Object Storage): POST/DELETE /api/profile/photos, /primary; PhotoGrid on /profile; photo carousel on browse cards.
- Notifications: db.notifications, GET /api/notifications, POST /read; NotificationBell in Nav (8s polling, toast on new match). Email delivery is MOCKED → db.email_outbox.
- Boosted search: premium users first in GET /api/profiles (`is_premium` flag), Premium badge + gold border on card.
- Referrals: `referral_code` per user, register with `referral_code` / `?ref=` link; referrer gets +100 coins on invitee's first coin purchase (idempotent, `referral_rewarded`). GET /api/referrals; ReferralCard on /wallet.
- Payout account verification: POST /api/wallet/payout-account → pending; admin verify/reject; withdraw blocked until verified.
- Commission model changed: gifts/videocalls credit 100% to recipient; 30% withheld at withdrawal (fee/net/usd on withdrawal record).
- Admin: /admin page + /api/admin/payout-accounts, /api/admin/withdrawals (paid / rejected → refund).
- All remaining hardcoded UI strings (toasts, premium perks, empty states, dates headers) translated into all 8 languages.
- Extended profile: relationship intent, hobbies, height, weight, languages spoken, job title, income, kids, smoking, drinking, religion, bust size (non-male), 🍆 size (non-female). PATCH /api/auth/me validates height 100–250 / weight 30–300. ProfileDetailsForm on /profile; intent/height/job chips on browse cards.
- 9th–11th UI languages: Hindi (hi), Bengali (bn), Urdu (ur, RTL) — all keys translated each.
- Advanced search filters (intent, kids, smoking, religion, height range) → GET /api/profiles params.
- Full profile page /profile/:id (GET /api/profiles/{id} + is_premium/liked_by_me/conversation_id); card image click opens it.
- Admin "Prices" tab: GET/PUT /api/admin/settings (gifts, coin packs, premium price, video rate, date min coins, referral bonus, commission) stored in db.settings id=pricing; all pricing reads via get_settings().

## Backlog
- P1: Real email provider (Resend/SendGrid) for notifications — replace email_outbox mock (waiting for user API key).
- P2: Real WebRTC video calls; multi-currency payouts; "see who liked you" premium perk.
