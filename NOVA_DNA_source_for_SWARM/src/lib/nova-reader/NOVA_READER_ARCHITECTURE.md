# NOVA Reader — Architecture

**Status:** shipped across upload surfaces + NOVA AI chat (assistive only)  
**Module:** `src/lib/nova-reader/`  
**UI kit:** `NovaReaderAssist` + `NovaReaderPreviewPanel`  
**Shared action:** `src/app/(app)/nova-reader/read-action.ts`

---

## Goals

- **OCR + LLM:** Ingest PDF/image → readable text (PDF text layer and/or vision OCR) → structured business fields.
- **Assistive only:** Prefill **editable** ERP form fields or show chat preview. **Never** create PurchaseBill / voucher / ledger / receipt rows from Reader alone.
- **Transparent:** CamScanner-like preview shows page thumbnail(s) + **read text**.
- **Reusable engine:** One `readDocument` pipeline; module mappers + shared UI; chat paperclip uses the same path.

## Non-goals

- Silent posting, auto-approve, or bypassing maker–checker / SoD.
- Full on-device Tesseract stack (vision LLM + PDF text / poppler is the path).
- Guaranteed perfect extraction — low confidence / partial prefills are expected.

---

## Upload surfaces (wired)

| Surface | Mode | Notes |
|---------|------|--------|
| **NOVA AI chat** (`/ai-assistant`, bubble) | Preview **or** page-intent fill | Paperclip uses `selectChatReaderIntent(pathname)`; on fillable routes returns mapped `draft` + **Yes / Review / Dismiss** chips via CustomEvent bridge; off-route → kind-aware Open module chips. **Open module → navigate → rematerialize** (held file + page intent) then re-prompt fill. CamScanner `variant="bubble"`. Drafts never in sessionStorage. |
| **Purchase Bills → New** | Form map | Vendor, invoice #/date, lines, TDS/RCM; also `useNovaReaderFormFill` |
| **Billing → New / Edit draft** | Form map | Customer (GSTIN/name), dates, place of supply, lines; bubble fill |
| **Sales Orders → New** | Form map | Customer + lines (shared billing draft shape) |
| **Purchase Orders → New** | Form map | Vendor + lines (shared purchase-bill draft shape) |
| **Receipts → New** | Form map | Amount, date, UTR + payment proof attach |
| **Payment Requests → New** | Form map | Amount, purpose, vendor |
| **Manual Expenses → New** | Form map | `manual_expense` intent — amount/date/party/purpose; vendor match → VENDOR_PAYMENT; ACL mirrors create (accounts + accountant/admin); **never auto-posts** |
| **Page-top `NovaReaderAssist`** | Form map (compact) | Kept (not removed). Default `layout="compact"` + **Open NOVA bubble** affordance; shares `NovaReaderPreviewPanel` with fields. |
| **DocumentSection** (customers, vendors, projects, billing, PBs, PRs, receipts, deliveries, approvals, tasks…) | Preview only | “Read with NOVA Reader” beside normal Upload |
| Payment proof on PR mark-paid | Upload only | DocumentSection covers PR attachments; mark-paid file stays optional upload |

**Out of Reader scope (wrong format):** bank CSV/XLS, Tally XML, GSTR JSON, backup dumps, company logo.

**Credit notes:** use billing doc types on the billing form (covered).

---

## Pipeline

```text
upload (PDF | JPG | PNG | WebP | GIF | HEIC/HEIF)
    │
    ▼
ingest
    ├─ validate format (Reader allowlist; 25 MB)
    ├─ PDF: pdftotext ∥ pdftoppm (first ≤2 pages @ 96 DPI, deferred)
    └─ image: preprocess (EXIF → upscale tiny / long edge ~1800 → dark invert+contrast or normalize/sharpen → JPEG ≤~1.4 MB)
    │
    ▼
fast path? rich PDF text → single text-only LLM
    │ no / failed
    ▼
vision on first-page PNG **or** preprocessed photo — Gemini native (key1→key2→key3) + OpenRouter + Groq Scout (key1→key2); text Llamas skipped
    │
    ▼
structured fields (soft-parsed) + preview — rawText alone is enough for chat notes
    │
    ├──────────────┬────────────────┬──────────────────┬────────────────┐
    ▼              ▼                ▼                  ▼                ▼
UI / chat     purchase-bill    receipt mapper    payment-request   billing
preview       mapper           mapper            mapper            mapper
```

### Image pipeline (photos / screenshots / handwriting)

1. **EXIF orientation** via `sharp.rotate()`
2. **Upscale** tiny crops (short edge &lt; 360) so WhatsApp strips / handwriting have enough pixels
3. **Downscale** long edge to `NOVA_READER_IMAGE_LONG_EDGE` (1800) with Lanczos3
4. **Dark UI / low-light** (mean luminance &lt; 90): invert → mild normalize → light sharpen (4:4:4 JPEG)
5. **Light photos**: mild `normalize()` + light `sharpen`
6. **JPEG** mozjpeg ~Q82; step quality down if over `NOVA_READER_IMAGE_MAX_VISION_BYTES`
7. **HEIC/HEIF** converted to JPEG for vision (sharp heif)
8. Photos **always** take the vision path (no PDF text-layer assumption)
9. Prompt hints cover chat bubbles, dark UI, and **handwriting**
10. Failures distinguish missing vision key / quota / unavailable vs truly empty OCR
11. **429/503 UX:** Provider failover hops faster on quota; chat/Reader show clear rate-limit copy + brief client cooldown (do not silently soft-fail)

**Vision failover (shipped):** Gemini native multi-key → OpenRouter → Groq Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) on key1 then key2 (`GROQ_API_KEY_2`); Scout fallback `qwen/qwen3.6-27b`. See `docs/NOVA_READER_VISION_FAILOVER_PLAN.md` + `docs/NOVA_READER_VISION_KEYS_GUIDE.md`.

PDF text-first fast path is unchanged and must not regress.

---

## Module layout

| Path | Role |
|------|------|
| `src/lib/nova-reader/read-document.ts` | Orchestrator |
| `src/lib/nova-reader/preprocess-image.ts` | Photo EXIF / downscale / sharpen |
| `src/lib/nova-reader/formats.ts` | MIME / HEIC allowlist |
| `src/lib/nova-reader/llm-extract.ts` | Gemini + OpenAI-compat |
| `src/lib/nova-reader/mappers/*` | PB / billing / receipt / payment-request drafts |
| `src/lib/nova-reader/fillable-form-registry.ts` | Route → intent/title for bubble fill |
| `src/lib/nova-reader/form-fill-bridge.ts` | CustomEvent chat → form applyDraft |
| `src/hooks/use-nova-reader-form-fill.ts` | Form-side subscriber hook |
| `src/components/nova-reader-assist.tsx` | Shared file + Read UI |
| `src/components/nova-reader-preview.tsx` | CamScanner panel (`page` \| `bubble`) |
| `src/components/nova-ai-chat.tsx` | Chat paperclip → Reader reply + fill chips |
| `src/app/(app)/nova-reader/read-action.ts` | Shared server action |

---

## Security & gates

1. `PlatformSettings.aiAssistantEnabled`
2. `isNovaLlmConfigured()`
3. Chat / forms: signed-in user; PB action still checks `purchasebill.create` where specialized
4. Kill switch: `NOVA_READER_ENABLED=false` or `INVOICE_OCR_ENABLED=false`
5. Max **25 MB**; Reader format allowlist (not the 10 MB general doc upload cap). Too-large / unusable OCR messages are explicit (`novaReaderTooLargeMessage`, vision failure reasons).
6. **No ledger writes** from Reader or chat upload
7. **Intent ACL (NOVA-R1 / N10):** `intent-acl.ts` gates Assist intents on create/write (e.g. `invoice.create`); chat `preview` uses the same Assist OR-set — **not** bare `*.read` (Staff money-hide / POL-1)
8. **Purchase bill fill:** single `PurchaseBillVendorProjectPicker` (controlled vendor/project) — Reader prefills matched vendor without duplicate vendor/project fields

---

## Performance

| Limit | Value |
|-------|--------|
| Max upload | 25 MB |
| Preview / vision pages | 2 @ 96 DPI |
| Photo long edge | 1800 px |
| Photo min short edge (upscale) | 360 px |
| Vision image budget | ~1.4 MB JPEG |
| Overall `readDocument` | 55 s |
| Text-only LLM | 22 s |
| Vision LLM | 28 s |

1. **PDF fast path:** rich `pdftotext` → one text-only LLM (skip vision).
2. **Scans:** first-page PNG @ 96 DPI only — never full multi-page PDF base64.
3. **Photos:** preprocess (dark invert / upscale) → Gemini native multi-key + OpenRouter + Groq Scout (never text Llama).
4. Chat Reader replies are **in-memory** (preview / draft / fill act not persisted to sessionStorage).
5. Bubble fill applies via `nova-reader-fill-request` CustomEvent — same applyDraft as page Assist; never auto-posts ledger.

---

## Tests

```bash
npm run test:nova-reader
```

Covers soft-parse, gates, MIME/HEIC, image preprocess, mappers, fillable-form registry/bridge. Mappers return drafts only — no Prisma/ledger calls.
