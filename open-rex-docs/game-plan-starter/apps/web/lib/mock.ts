// Single source of truth for mocked entities. Replace per-table when wiring
// real Supabase reads. Every shape mirrors the live schema so swap is mechanical.

export const dealer = {
  id: "dlr_001",
  tenant_id: "tnt_001",
  name: "Nissan of Omaha",
  brand: "Nissan",
  consent_coverage_score: 87,
  voice_fingerprint_summary:
    "Direct, friendly, sports-metaphor heavy, never pushy.",
};

export const manager = {
  id: "usr_eddie",
  name: "Eddie Ponce",
  role: "Sales Manager",
  avatar_initials: "EP",
};

export const reps = [
  { id: "rep_001", name: "Jordan Vasquez", initials: "JV", online: true },
  { id: "rep_002", name: "Marcus Hill", initials: "MH", online: true },
  { id: "rep_003", name: "Tasha Reid", initials: "TR", online: false },
  { id: "rep_004", name: "Dev Patel", initials: "DP", online: true },
];

export type Customer = {
  id: string; first: string; last: string; phone: string; vehicle: string;
  months: number; equity: "positive" | "neutral" | "negative"; last_contact: string;
};

export const customers: Customer[] = [
  { id: "c01", first: "Carla", last: "Mendez", phone: "(402) 555-0142", vehicle: "2022 Murano SL", months: 33, equity: "positive", last_contact: "2 days ago" },
  { id: "c02", first: "Greg", last: "Whitaker", phone: "(402) 555-0118", vehicle: "2021 Rogue SV", months: 41, equity: "positive", last_contact: "6 hours ago" },
  { id: "c03", first: "Amelia", last: "Park", phone: "(402) 555-0193", vehicle: "2023 Pathfinder", months: 22, equity: "neutral", last_contact: "11 min ago" },
  { id: "c04", first: "Tyrese", last: "Brooks", phone: "(531) 555-0177", vehicle: "2020 Altima SR", months: 52, equity: "positive", last_contact: "1 day ago" },
  { id: "c05", first: "Linh", last: "Tran", phone: "(402) 555-0210", vehicle: "2022 Frontier SV", months: 30, equity: "positive", last_contact: "3 hours ago" },
  { id: "c06", first: "Rashid", last: "Khan", phone: "(402) 555-0233", vehicle: "2021 Sentra SR", months: 39, equity: "neutral", last_contact: "Yesterday" },
  { id: "c07", first: "Brianna", last: "Foley", phone: "(402) 555-0288", vehicle: "2020 Murano Platinum", months: 56, equity: "positive", last_contact: "4 days ago" },
  { id: "c08", first: "Owen", last: "Castillo", phone: "(531) 555-0301", vehicle: "2023 Kicks SR", months: 18, equity: "negative", last_contact: "2 hours ago" },
];

export type GamePlan = {
  id: string; name: string;
  status: "running" | "draft" | "completed";
  pool_size: number; sent: number; replies: number; appointments: number;
  created: string; offer: string; cadence: string;
};

export const gamePlans: GamePlan[] = [
  { id: "gp_001", name: "Murano Lessees / 30–36mo / Reno store", status: "running", pool_size: 142, sent: 142, replies: 27, appointments: 9, created: "Apr 22", offer: "$500 off lease upgrade this month — Murano owners only.", cadence: "+24h, +72h" },
  { id: "gp_002", name: "Rogue 36–48mo equity callouts", status: "running", pool_size: 88, sent: 88, replies: 14, appointments: 4, created: "Apr 25", offer: "Trade your Rogue, keep your payment. Quick number for you?", cadence: "+24h" },
  { id: "gp_003", name: "Past Frontier service customers (lapsed 90d)", status: "draft", pool_size: 64, sent: 0, replies: 0, appointments: 0, created: "Today", offer: "", cadence: "+24h, +72h, +7d" },
  { id: "gp_004", name: "Lease maturity — May expirations", status: "completed", pool_size: 211, sent: 211, replies: 48, appointments: 19, created: "Apr 1", offer: "Your lease is up in 30 days. Coffee & a number?", cadence: "+24h, +72h, +7d" },
];

const previewBodies: Record<string, string> = {
  c01: "Hey Carla — Eddie at Nissan of Omaha. You're coming up on 33 months in your Murano SL. Quick heads up: I can probably get you into a new one for the same payment. $500 off this month for current Murano owners. Worth a look?",
  c02: "Greg — Eddie from Nissan of Omaha. Your Rogue's been a workhorse — 41 months in. Equity's strong right now, and I've got $500 off if you're open to seeing the numbers on a 2026. No pressure, just figured you'd want to know.",
  c03: "Hi Amelia — quick note from Eddie at Nissan of Omaha. The Pathfinder's been a great fit for almost two years. I've got a $500 upgrade incentive on the table this month if you ever want to peek at what's new.",
  c04: "Tyrese — Eddie at Nissan of Omaha. 52 months in the Altima SR, that's a long run. You're sitting on real equity. $500 off lease upgrades this month — happy to run the numbers if you want.",
  c05: "Hey Linh — Eddie from Nissan of Omaha. Your Frontier's hitting 30 months and trucks are holding value like crazy right now. $500 off if you want to see what an upgrade looks like. Let me know.",
  c08: "Hey Owen — Eddie at Nissan of Omaha…",
};

export type ConvStatus = "awaiting_approval" | "ai_handled" | "assigned" | "appointment_set" | "opted_out";
export type Conversation = {
  id: string; customer: Customer; plan: string; status: ConvStatus;
  last_msg_preview: string; unread: number; assigned_to: string | null;
  thread: { dir: "in" | "out"; from?: string; text: string; ts: string }[];
  drafts: { tone: string; text: string }[];
  flags: string[];
};

export const conversations: Conversation[] = [
  {
    id: "cv_001", customer: customers[0], plan: "gp_001", status: "awaiting_approval",
    last_msg_preview: "What's the payment look like on the new one?", unread: 1, assigned_to: null,
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c01, ts: "Yesterday 2:14 PM" },
      { dir: "in", text: "Yeah maybe. What time you open?", ts: "Yesterday 4:02 PM" },
      { dir: "out", from: "rex", text: "We're open till 9 tonight, 9–6 Saturday. Want me to set something specific or just walk in?", ts: "Yesterday 4:03 PM" },
      { dir: "in", text: "What's the payment look like on the new one?", ts: "11 min ago" },
    ],
    drafts: [
      { tone: "soft", text: "Great question — payment depends on the trim and any equity in your current Murano. I'll have Jordan run the exact numbers and text you back today. Cool?" },
      { tone: "direct", text: "Depends on which trim — but for a like-for-like SL we can usually keep you in the same payment range. Want to come in at 5pm and we'll show you on paper?" },
      { tone: "set_appointment", text: "Best way is to lock in 15 min — I'll have Jordan ready with three payment options. 5pm or 6pm work better?" },
    ],
    flags: ["hard_keyword:payment"],
  },
  {
    id: "cv_002", customer: customers[1], plan: "gp_002", status: "ai_handled",
    last_msg_preview: "still interested", unread: 0, assigned_to: null,
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c02, ts: "6h ago" },
      { dir: "in", text: "still interested", ts: "4h ago" },
      { dir: "out", from: "rex_auto", text: "Awesome Greg — Jordan from our team will reach out today to set a quick time. What's your best window?", ts: "4h ago" },
    ],
    drafts: [], flags: [],
  },
  {
    id: "cv_003", customer: customers[2], plan: "gp_001", status: "assigned",
    last_msg_preview: "Saturday morning works", unread: 0, assigned_to: "rep_001",
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c03, ts: "1d ago" },
      { dir: "in", text: "sounds good when?", ts: "20h ago" },
      { dir: "out", from: "rex_auto", text: "Saturday or weekday evening better?", ts: "20h ago" },
      { dir: "in", text: "Saturday morning works", ts: "11 min ago" },
    ],
    drafts: [], flags: [],
  },
  {
    id: "cv_004", customer: customers[3], plan: "gp_001", status: "awaiting_approval",
    last_msg_preview: "what's the APR these days", unread: 1, assigned_to: null,
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c04, ts: "2h ago" },
      { dir: "in", text: "what's the APR these days", ts: "12 min ago" },
    ],
    drafts: [
      { tone: "soft", text: "Tyrese — APR depends on credit tier and term. I'd rather show you the actual number than guess. Want to swing by tonight?" },
      { tone: "direct", text: "Tier 1 is running mid-5s right now on 60mo. We can lock that in if it fits. Want me to set you up with Jordan?" },
      { tone: "set_appointment", text: "Easier to show you than text it — Jordan has openings at 5 or 6:30. Which?" },
    ],
    flags: ["hard_keyword:APR"],
  },
  {
    id: "cv_005", customer: customers[4], plan: "gp_002", status: "appointment_set",
    last_msg_preview: "see you sat 10am", unread: 0, assigned_to: "rep_002",
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c05, ts: "3h ago" },
      { dir: "in", text: "sat 10 work?", ts: "2h ago" },
      { dir: "out", from: "manager", text: "Done — Marcus will have a Frontier Pro-4X ready to look at. See you at 10.", ts: "2h ago" },
      { dir: "in", text: "see you sat 10am", ts: "1h ago" },
    ],
    drafts: [], flags: [],
  },
  {
    id: "cv_006", customer: customers[7], plan: "gp_001", status: "opted_out",
    last_msg_preview: "STOP", unread: 0, assigned_to: null,
    thread: [
      { dir: "out", from: "rex", text: previewBodies.c08, ts: "4h ago" },
      { dir: "in", text: "STOP", ts: "3h ago" },
      { dir: "out", from: "system", text: "You've been opted out. Reply START to resume.", ts: "3h ago" },
    ],
    drafts: [], flags: ["opt_out"],
  },
];

export const auditLog = [
  { ts: "2026-04-28 14:02:11", actor: "Eddie Ponce", event: "attestation", target: "gp_001", detail: "Manager attested consent for 142 customers · pool_hash 7a41f…" },
  { ts: "2026-04-28 14:02:42", actor: "system", event: "message_sent", target: "c01", detail: "Outbound queued — Sonnet 4.6 — $0.00012" },
  { ts: "2026-04-28 14:03:01", actor: "system", event: "message_sent", target: "c02", detail: "Outbound queued — Sonnet 4.6 — $0.00012" },
  { ts: "2026-04-28 16:11:09", actor: "system", event: "reply_received", target: "c01", detail: "Classifier: timing — auto-reply allowed" },
  { ts: "2026-04-29 09:18:33", actor: "Eddie Ponce", event: "manager_approved", target: "cv_001", detail: "Approved direct-tone draft" },
  { ts: "2026-04-29 09:22:01", actor: "system", event: "opt_out", target: "c08", detail: "STOP keyword detected · DNC mark applied across tenant" },
  { ts: "2026-04-29 11:41:55", actor: "Eddie Ponce", event: "assignment", target: "cv_003", detail: "Assigned to Jordan Vasquez (rep_001)" },
  { ts: "2026-04-29 14:00:02", actor: "system", event: "cadence_nudge", target: "gp_002", detail: "+24h nudge sent to 41 non-responders" },
];

export const lensRows = [
  { name: "Carla Mendez", vehicle: "2022 Murano SL", months: 33, phone: "(402) 555-0142", equity: "positive" },
  { name: "Greg Whitaker", vehicle: "2021 Rogue SV", months: 41, phone: "(402) 555-0118", equity: "positive" },
  { name: "Amelia Park", vehicle: "2023 Pathfinder", months: 22, phone: "(402) 555-0193", equity: "neutral" },
  { name: "Tyrese Brooks", vehicle: "2020 Altima SR", months: 52, phone: "(531) 555-0177", equity: "positive" },
  { name: "Linh Tran", vehicle: "2022 Frontier SV", months: 30, phone: "(402) 555-0210", equity: "positive" },
  { name: "Rashid Khan", vehicle: "2021 Sentra SR", months: 39, phone: "(402) 555-0233", equity: "neutral" },
  { name: "Brianna Foley", vehicle: "2020 Murano Plat.", months: 56, phone: "(402) 555-0288", equity: "positive" },
  { name: "Owen Castillo", vehicle: "2023 Kicks SR", months: 18, phone: "(531) 555-0301", equity: "negative" },
];

export const coachExchanges = [
  { role: "manager" as const, text: "I want to find every Murano lessee who came in for service in the last 60 days. Can you build it?" },
  { role: "rex" as const, text: "Yes — I can pull that from VinSolutions service history filtered by Murano. Roughly 80–110 customers based on your service-write volume. Want me to suggest the offer copy too, or do you have something in mind?" },
  { role: "manager" as const, text: "Suggest it. Soft tone, lease-end angle." },
  { role: "rex" as const, text: '"Hey {first} — saw you in for service recently in the Murano. With lease-ends moving fast right now, figured I\'d give you a heads up: $500 upgrade incentive this month for current owners. No pressure, just wanted you to know first." — Want me to spin up the Game Plan?' },
];

export const weeklyStats = {
  sent: 441, replies: 89, reply_rate: 20.2, appointments: 28,
  appointments_kept: 22, sold: 11, revenue_attributed: 412800,
};
