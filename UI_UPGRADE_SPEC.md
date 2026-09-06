# PocketRep V1 Elite UI Upgrade — HANDOFF

Source tracker: GitHub issue #171.

## North star
PocketRep should feel like a sophisticated personal sales operating system built for automotive reps: fast, premium, calm under pressure, and immediately actionable. Preserve the working V1 engine; refactor the experience around it.

## Permanent information architecture
1. **Heat / Today** — compact strike list, priority counts, one dominant `Work My Book` action, ranked customers.
2. **Work My Book** — execution workspace with `Recommended`, `Calls`, and `Texts`; authoritative Call Queue + Text Queue remain underneath.
3. **Contacts** — search/filter/manage the rep-owned book.
4. **Customer Profile** — the money screen: customer/vehicle/context/activity/Rex recommendation + one dominant next action.
5. **Rex** — AI sales partner for Work My Book, drafting, objections, opportunity discovery, Quick Capture, and selected-contact coaching.
6. **Metrics / Sales Log** — pace, sold/gross/commission, goals, recent sales, Log a Sale.
7. **You** — profile plus Garage-style grouped settings: Driver / Vehicle / Maintenance.

## Design rules
- Sophisticated, restrained automotive interior/HUD influence; never cartoony or game-like.
- Black/charcoal depth. Texture only as a subtle background accent.
- Gold = money, selected state, and primary action.
- Red = urgent/overdue. Green = success/completed/appointment. Neutral gray = secondary.
- Consistent monochrome vector icons; eliminate emoji UI icons from core navigation/settings.
- Sharp Rex mode uses a crosshair/precision icon, never a knife.
- Compact headers; avoid repeating a giant logo/title block on every tab.
- No detached `REX LIVE` pill. Rex is a true center nav slot with a small online dot.
- No content may render behind Rex or the tab bar.
- Important values do not truncate when a second line/detail row can solve it.
- 150–220ms native-feel transitions; reduced-motion safe.
- Swipe actions can be additive but never replace visible Call/Text controls.

## Installed PWA shell acceptance
- `viewport-fit=cover`.
- Root shell uses dynamic viewport sizing (`100dvh` where supported).
- Respect `env(safe-area-inset-top/right/bottom/left)`.
- Installed Home Screen mode fills the device viewport with no unexplained blank bands above/below the app.
- Browser Safari may show browser chrome; the app itself must not add fake status/home-indicator gaps.
- Bottom nav stays pinned and content receives enough bottom padding to remain fully visible.
- No horizontal overflow on current iPhone portrait sizes or compact Android widths.
- Inputs remain >=16px on web to prevent iOS focus zoom.

## V1 non-regression contract
Preserve and keep connected: onboarding + visual tour, demo aha/reply, install education, sold-book activation, Heat Sheet, stalled leads, follow-up queue, Work My Book, Call Queue, Text Queue, manual native SMS, exact outbound draft/timestamp history, Yes I Sent It / Not Sent, DNC/opt-out, duplicate/recent-contact protections, demo send block, Contacts/tags/import/Quick Capture, Rex durable history and selected-contact context, canonical sequences + Fresh Up explicit classification, deal logging, metrics, compensation/pay plan, goals/quota, profile/dealership/inventory surface/install/billing/support/legal/referrals, pricing/grandfathering, immutable history, and production schema compatibility.

## Interaction acceptance
Every visible control must work or be clearly disabled with a reason. No dead taps. Primary actions live in thumb reach when practical. Loading/empty/error states preserve layout instead of flashing/reflowing. Final literal iPhone Safari + Home Screen front/back acceptance is required before closing #159.
