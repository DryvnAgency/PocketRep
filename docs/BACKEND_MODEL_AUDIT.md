# Backend Model Cleanup + Replacement Audit

_Workstream A. Branch: `claude/backend-model-cleanup`. Date: 2026-06-05. Draft — not deployed._

## 1. What this PR changes (code-only, nothing deployed)

**Deleted the dead Gemini surface**
- Removed every `gemini-2.5-flash` model string (`app/(tabs)/index.tsx`, `more.tsx`, `rex.tsx`, `snack-HeyRexOrb.js`).
- Retired the misleadingly-named `/gemini` proxy route (it never used Gemini — it pointed at Anthropic). The honest `/rexlens` alias is now the only name; clients call `/rexlens`.
- Removed the broken native Whisper STT call (`rex.tsx`) that POSTed to `/ai-proxy/whisper`, a route that never existed.

**Made all Anthropic/Claude usage DORMANT behind a reversible flag (code kept, inert)**
- Proxy `ai-proxy/index.ts`: `ANTHROPIC_ENABLED` (Deno env, default off). `handleRexLens` returns `503 rexlens_disabled` while off. Model handling hardened to coerce any non-`claude-` id to the default.
- App `lib/featureFlags.ts`: `ANTHROPIC_ENABLED` (`EXPO_PUBLIC_ANTHROPIC_ENABLED`, default off) gates the native Heat Sheet brief, weekly digest, and Rex screenshot/action branch.
- Extension `RexLens/src/shared/prompts.ts`: `ANTHROPIC_ENABLED = false` gates `callAIProxy` in the service worker.

**End state:** the only live AI surface is the OpenRouter **brain** — `x-ai/grok-4.3` → `moonshotai/kimi-k2.6` — via `/ai-proxy/brain`. Anthropic is reachable only by flipping the flags back on.

### How to reverse (flip Claude back on)
1. Edge function: set secret `ANTHROPIC_ENABLED=1`, redeploy `ai-proxy`.
2. App: build with `EXPO_PUBLIC_ANTHROPIC_ENABLED=1`.
3. Extension: set `ANTHROPIC_ENABLED = true` in `shared/prompts.ts`, rebuild.

No Claude code was deleted — only gated.

---

## 2. Research caveat (read before trusting the numbers)

The capability findings below were gathered by web research on 2026-06-05. **Direct page fetches returned HTTP 403 on every primary domain** (openrouter.ai, docs.x.ai, Moonshot), so the findings come from **search-result snippets that quote those primary pages**, not from reading the pages verbatim. Treat exact field names/numbers as "strongly indicated by the cited page," and **click the source URLs to confirm before relying on any single number.** Cross-source conflicts are flagged inline.

---

## 3. Capability matrix (can Grok 4.3 → Kimi K2.6 cover what Claude did?)

| Capability | Grok 4.3 (`x-ai/grok-4.3`) | Kimi K2.6 (`moonshotai/kimi-k2.6`) | OpenRouter STT |
|---|---|---|---|
| **Vision / image input** | **Yes** (text+image in, jpg/png) | **Yes** — native multimodal (text+image+video). *Not text-only.* | n/a |
| **Audio input / transcription** | **No** (chat model). xAI audio = TTS only on OR | **No** | **Yes — but separate endpoint & different models** |
| **Structured output (JSON Schema/json mode)** | **Yes** (+ function calling, combinable) | **Yes** (+ tool calling; thinking-mode limits `tool_choice` to auto/none) | n/a |
| **Context window** | **~1M tokens** per OpenRouter page ⚠️ (xAI docs show 256K for Grok 4 0709 — conflict, confirm) | **262,144 (256K)** | n/a |

**OpenRouter STT detail:** there *is* a Whisper-equivalent — a dedicated `POST /api/v1/audio/transcriptions` endpoint (base64 audio, `model`+`language`+`provider` params, `{text,usage}` response), plus optional `input_audio` parts in chat-completions. **But transcription is served by OpenAI/Google/Groq/Mistral/Microsoft Whisper-class models — NOT by Grok or Kimi.** (This corrects an earlier "OpenRouter has no STT" claim: it has STT, just not via our two models.)

**Fallback sharp edge:** the `models: [grok, kimi]` array fails over on **5xx / 404 / rate-limit / mid-stream** errors but **NOT on 400 (bad request)**. A modality mismatch typically surfaces as 400, so the array is **not** a reliable "vision safety net." Low-risk today since both models accept images. Structured-output support is enforced **per-model**, not array-wide.

---

## 4. Direct answer: can Grok/OpenRouter do speech-to-text for the old `/whisper` path?

**Not via Grok or Kimi.** Neither transcribes audio. OpenRouter *does* expose a real STT endpoint (`/api/v1/audio/transcriptions`) backed by Whisper-class models (e.g. `whisper-1`, Whisper Large V3, GPT-4o Transcribe, Google Chirp 3, Groq Whisper Turbo, Mistral Voxtral, MS MAI-Transcribe). So STT on OpenRouter is possible — but it's a **different endpoint and a different model**, not the Grok→Kimi brain.

Practical impact: removing the dead `/ai-proxy/whisper` call was correct. **The web app already uses the on-device Web Speech API** (free, no server) for voice input, so web voice capture is unaffected. Native has no STT today; to add it, route audio to OpenRouter's transcription endpoint (or a dedicated provider) behind the proxy.

---

## 5. Full-workflow feasibility: Grok 4.3 (with Kimi fallback) end-to-end

| Feature | Workload type | Verdict | Notes / risk |
|---|---|---|---|
| Rex Coach / rebuttals | text reasoning | **Solid** | Already live on `/brain` today. |
| Conversation parse (voice-note → contact+follow-up) | structured JSON extract | **Solid–Moderate** | Both models support JSON Schema; validate extraction reliability on messy notes. Already on `/brain`. |
| Blast / nurture / sequence drafts | constrained text gen | **Solid** | Strict copy rules are prompt-enforced; Grok handles. Already on `/brain`. |
| Weekly digest | summarization | **Solid** | Already on `/brain` (v2 `WeeklyDigestCard`). |
| Stalled-leads analysis | reasoning + JSON | **Moderate** | Structured-output reliability worth an eval. Already on `/brain`. |
| Game Plan scripts | text gen | **Solid** | Already on `/brain`. |
| **Vision** (Rex Lens screenshot scan, native screenshot/action) | image understanding of CRM UIs | **Moderate–High risk** | Grok 4.3 **and** Kimi K2.6 accept images, **but there is no primary benchmark vs Claude Haiku on CRM-screenshot/OCR-style understanding.** This is the one workload where Claude was doing real differentiated work. **Run an eval on representative CRM screenshots before relying on Grok/Kimi here.** This is precisely why Rex Lens is left dormant-but-reversible rather than repointed at the brain. |
| **STT** (voice capture) | speech-to-text | **Gap — not covered** | Grok/Kimi can't transcribe. Needs OpenRouter's transcription endpoint (Whisper-class) or a dedicated STT provider. Web uses on-device Web Speech API. |

**Bottom line:** Grok 4.3 (Kimi K2.6 fallback) can carry the **entire text workflow** end-to-end — coaching, parsing, drafting, digest, stalled-leads, game plan — and most of that already runs on it today. The two honest gaps are **(a) vision quality vs Claude is unverified** (eval needed before reviving Rex Lens on the brain) and **(b) STT is not a Grok/Kimi capability at all** (route to a Whisper-class model if native voice is wanted).

## Open items for the owner
- Resolve the **Grok 4.3 context-window conflict** (OpenRouter ~1M vs xAI 256K) before depending on long-context behavior.
- If Rex Lens is ever revived on the brain instead of Claude, **eval Grok/Kimi vision on real CRM screenshots** first.
- Decide whether native STT is worth wiring (OpenRouter `/audio/transcriptions`), or whether on-device Web Speech (web-only) is sufficient.

## Sources (accessed 2026-06-05; via search snippets — primary pages 403'd on direct fetch)
- OpenRouter: STT/audio guides, `/api/v1/audio/transcriptions` reference, speech-to-text model collection, model-fallbacks, provider-selection, structured-outputs, errors reference.
- `openrouter.ai/x-ai/grok-4.3`, `docs.x.ai/developers/models/grok-4.3`, `docs.x.ai/developers/model-capabilities/audio/voice`.
- `openrouter.ai/moonshotai/kimi-k2.6`, `huggingface.co/moonshotai/Kimi-K2.6`, `developers.cloudflare.com/workers-ai/models/kimi-k2.6/`.
