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
- Advanced search filters (intent, kids, smoking, drinking, religion, income, spoken language, hobby text, job text, height/weight ranges, bust/🍆 size, max date price, premium-only, with-photos, verified-only) → GET /api/profiles params.
- Full profile page /profile/:id (GET /api/profiles/{id} + is_premium/liked_by_me/conversation_id); card image click opens it.
- Phone-number guard in chat: numbers (7+ digits incl. separators, or messenger keyword + digits) are blocked until the pair has a confirmed/released date booking. Each violation → warning notification (PHONE_BLOCKED:n:3); 3rd violation → account blocked 7 days (blocked_until; login and all API return 403 BLOCKED:<iso>), logged in db.moderation_log. Chat shows rule hint under the input.
- Advanced filters are Premium-only: backend returns 403 PREMIUM_REQUIRED if any advanced param is used by a free user; /browse shows a lock card with "Get Premium" CTA instead of the filter panel.
- Date accept/decline: recipient must accept (escrow→accepted) before photo-confirm; decline refunds coins to booker and clears escrow (status declined). Notifications date_request/date_accepted/date_declined. Cancel allowed in escrow/accepted.
- Availability calendar on /profile (`availability`: list of YYYY-MM-DD; empty = all days). GET /api/profiles/{id}/availability → available_days + busy_days (existing escrow/accepted/confirmed bookings). Booking modal has a calendar: past/busy/unavailable days disabled; backend rejects DAY_UNAVAILABLE / DAY_BUSY.
- Coin packages: Small Talk 100/$9.99, Starter 300+20/$29.99, Popular 1000+50/$99.99, Extra 2000+150/$189, VIP 3000+300/$295; Custom amount: $1 = 10 coins +2% bonus, min $1 (package_id "custom" + usd_amount). All editable in admin Prices.
- Free users: 15 likes/day (repeat likes of same target not counted); 16th → 429 LIKE_LIMIT:n; Premium unlimited. GET /api/likes/quota; quota badge on /browse; limit editable in admin Prices (free_daily_likes).
- Per-profile date price (`date_price`, ≥ global min 300) editable on /profile; shown on card chip and profile page; prefilled in booking modal.
- Admin "Prices" tab: GET/PUT /api/admin/settings (gifts, coin packs, premium price, video rate, date min coins, referral bonus, commission) stored in db.settings id=pricing; all pricing reads via get_settings().

## Backlog
- P1: Real email provider (Resend/SendGrid) for notifications — replace email_outbox mock (waiting for user API key).
- P2: Real WebRTC video calls; multi-currency payouts; "see who liked you" premium perk.
