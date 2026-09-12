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
- Multi-photo upload (max 12, Object Storage): POST/DELETE /api/profile/photos, /primary; PhotoGrid on /profile; photo carousel on browse cards.
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
- Booking & address change store full worldwide address: address, city/town, postal_code, country, lat/lng (AddressPicker via Nominatim autofills city/postcode/country; fields editable; Google Maps link). Shown on date cards.
- Address change with map: either party proposes a new meeting address (AddressPicker: OpenStreetMap Nominatim autocomplete, no API key; "Open in Google Maps" link with coordinates). Proposal stored as `pending_location`; the other party must approve/decline (POST /api/dates/location/{bid}/respond). Photo-confirm blocked while pending (LOCATION_PENDING). If not approved before the meeting day → auto-cancel with 50% refund to booker / 50% compensation to recipient (checked lazily on GET /api/dates).
- Date cancellation by booker refunds only 50% (`cancel_refund_pct`, admin-editable); the other 50% goes to the recipient's withdrawable as compensation (transaction type date_cancel_fee + notification). UI: warning note under Cancel button + confirm dialog with exact amounts.
- Gender options: female, male, trans woman, trans man, non-binary (registration, "interested in", search filter). Orientation field (straight, lesbian, gay, bisexual, pansexual, transgender, queer/other, prefer not) on registration & profile; shown on profile page; premium search filter.
- Payments: Stripe Checkout without payment_method_types → all methods enabled in the Stripe Dashboard for the buyer's country (cards worldwide, Apple/Google Pay, Link, PayPal, Klarna, iDEAL, SEPA, Alipay, WeChat Pay…); locale auto, billing address auto, customer_email prefilled. Wallet shows payment-methods note. NOTE: PayPal/local methods must be toggled on in Stripe Dashboard → Payment methods (sandbox currently shows card + Link + Cash App).
- Custom gift: pick any emoji (palette or type your own) and any amount ≥10 coins (gift_id "custom" + custom_icon/custom_cost); recorded as a normal gift transaction.
- Gift catalog: 🌹 Rose 50, 🍫 Chocolate 100, 🍾 Champagne 200, 👗 Dress 400, 🧴 Perfume 800, ⌚ Watch 1000, 💎 Jewelry 1500, 💍 Ring 5000 (editable in admin Prices).
- Identity verification (ID + selfie) joined to registration: after sign-up user lands on /verify (skippable) to upload ID document and selfie (POST /api/verification/upload?kind=id|selfie → Object Storage, private files served only to owner/admin). Status incomplete→pending→verified/rejected; admin tab "Verifications" approves/rejects → user.verified badge; notification sent. Profile shows "not verified" banner linking to /verify.
- Income has a "Custom amount" option with free-text `income_custom` (shown on profile page; excluded from search filter).
- Referral bonus is granted only when the invitee buys the configured package (`referral_package_id`, default "popular" = Popular Pack) for the first time; admin can choose the package or "any". Card text: "Earn 100 🪙 for every friend who buys their first Popular Pack".
- Minimum withdrawal $50 net (`min_withdraw_usd`, admin-editable): backend MIN_WITHDRAW:<n>; wallet dialog shows min note (≈ coins incl. commission) and disables submit below the minimum.
- Payout verification (KYC) form: Tax ID, full name, recipient street/city/province/postal/country/email; account number/IBAN, SWIFT, routing number (optional), bank name/street/city/province/postal/country. All required except routing_number; admin sees full details before approving.
- Availability time: default window `availability_time` {from,to} + per-day overrides `availability_slots`; booking sends local_time and backend rejects TIME_UNAVAILABLE:<from>-<to>; booking modal shows window and restricts time input.
- Per-profile video call rate (`video_rate` coins/min, ≥ global min 10) editable on /profile; call cost = minutes × max(target.video_rate, global); shown on profile page and in call modal.
- Payout rate: 10 coins = $1 (`coins_per_usd`, editable in admin Prices); withdrawal usd = net / coins_per_usd; Wallet shows rate and $ estimate.
- Recipient can change the meeting place (POST /api/dates/location/{bid} {venue, city}) while escrow/accepted; original venue kept (original_venue/city), booker notified (date_location) and may cancel.
- Escrow release: photo-confirm allowed only after scheduled_at (DATE_NOT_YET otherwise); release_at = max(scheduled_at + 24h, confirm time). Recipient must accept (escrow→accepted) before photo-confirm; decline refunds coins to booker and clears escrow (status declined). Notifications date_request/date_accepted/date_declined. Cancel allowed in escrow/accepted.
- Availability calendar on /profile (`availability`: list of YYYY-MM-DD; empty = all days). GET /api/profiles/{id}/availability → available_days + busy_days (existing escrow/accepted/confirmed bookings). Booking modal has a calendar: past/busy/unavailable days disabled; backend rejects DAY_UNAVAILABLE / DAY_BUSY.
- Coin packages: Small Talk 100/$9.99, Starter 300+20/$29.99, Popular 1000+100/$99.99, Extra 2000+150/$189, VIP 3000+300/$295; Custom amount: $1 = 10 coins +2% bonus, min $1 (package_id "custom" + usd_amount). All editable in admin Prices.
- Free users: 15 likes/day (repeat likes of same target not counted); 16th → 429 LIKE_LIMIT:n; Premium unlimited. GET /api/likes/quota; quota badge on /browse; limit editable in admin Prices (free_daily_likes).
- Per-profile date price (`date_price`, ≥ global min 300) editable on /profile; shown on card chip and profile page; prefilled in booking modal.
- Admin "Prices" tab: GET/PUT /api/admin/settings (gifts, coin packs, premium price, video rate, date min coins, referral bonus, commission) stored in db.settings id=pricing; all pricing reads via get_settings().
- Gifts in chat (2026-09-12): Gift button (data-testid chat-gift-button) in /chats composer opens GiftModal with `conversationId`; POST /api/gifts/send accepts optional `conversation_id` and inserts a `type: "gift"` message (gift_icon, gift_cost, text) rendered as an amber bubble in the thread. API + screenshot verified.
- Gift notifications + auto-match + thanks (2026-09-12, iteration_5 pass 21/21): every gift → recipient `gift` notification (email MOCKED). Gift ≥ `gift_auto_match_coins` (default 100, Admin→Prices `admin-gift-auto-match`, in /api/meta) → ensure_match() creates match+conversation, both get `match` notifications, gift message lands in the chat. POST /api/gifts/thanks {message_id, reaction} — recipient-only one-tap "Thanks ❤️/😘/🥰" under gift bubble, appends `thanks` message, sender gets `gift_thanks` notification. Bell items deep-link to /chats?c=<conversation_id>.
- AddressPicker: Google Places Autocomplete + map preview when REACT_APP_GOOGLE_MAPS_API_KEY is set (frontend/.env). 2026-09-12: real key configured & validated in-browser (Maps JS + Places load, no gm_authFailure) → worldwide autocomplete now ACTIVE; OSM Nominatim remains fallback if key removed.
- 2026-09-12 (iteration_7 pass 10/10): Chat photos after confirmed date — POST /api/conversations/{cid}/photo (403 MEDIA_LOCKED until have_met()), private file with viewers=[both], /matches.can_share_media; UI chat-photo-button (Lock/Camera), image bubbles. Presence — get_current_user heartbeat updates users.last_seen (60s throttle); lib/presence.jsx (Online <5m / Active recently <60m / Active today / Last seen date) shown in chat sidebar+header, ProfileCard, ProfileView.
- 2026-09-12 (iteration_6 pass): Chat avatars = real profile photos (sidebar, header w/ extra thumbnails, incoming messages), header → /profile/:id. "Liked you" strip on /matches: GET /api/likes/received (free → blurred id/photo only + Premium CTA; Premium → names + "Like back" instant match; matched likers excluded). Top givers: /api/profiles/{id} returns gifts_total, gifts_count, top_givers[3]; ProfileView card with 🥇🥈🥉.


## Backlog
- P1: Real email provider (Resend/SendGrid) for notifications — replace email_outbox mock (waiting for user API key).
- P2: Real WebRTC video calls; multi-currency payouts; "see who liked you" premium perk.
