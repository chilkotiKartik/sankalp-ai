# Basic-phone and WhatsApp channels (Phase 5.2 / 5.3)

Citizens without a smartphone or data can file and track complaints by **SMS**, **missed call** or **WhatsApp**. Every channel ends up in the same filing path as the app (`fileComplaintFor`): keyword classification, explainable routing, duplicate linking and the same state machine. A complaint still closes only when the citizen confirms the fix (they can reply 1/2 to the confirmation SMS or press 1/2 on the call).

No provider is hard-coded. Each channel is an interface with a console driver for development. In production, pick Indian, DLT-registered providers and add their hosts to `EGRESS_ALLOWLIST`.

## SMS keywords
| Citizen sends | Result |
|---|---|
| `SANKALP <problem>` | Files a complaint. The category comes from keywords (Hindi, English, Hinglish, Garhwali, Kumaoni) |
| `SANKALP <District> <problem>` | Same, and sets the district (for example `SANKALP Almora pani nahi aa raha`) |
| `AGREE` | Accepts the privacy notice (needed once). A complaint sent before that is filed now |
| `STATUS <ticket>` | Current state of **your own** ticket |
| `1` / `2` | Answer to "was it fixed?" (Phase 3.5) |
| `HELP` | Format help |

SMS-filed complaints have no GPS. They are marked `geoApproximate` (district centre), so they skip the geo proof check, neighbour invites and duplicate linking. An officer confirms the location.

**Webhook:** the gateway POSTs `{ "from": "+91XXXXXXXXXX", "text": "…" }` to `/api/verification/sms-inbound` with the header `X-Webhook-Secret: <INBOUND_SMS_SECRET_<TENANT>>` (or `INBOUND_SMS_SECRET` for all tenants). Replies use DLT templates (`server/notify/sms.ts`): `complaint_received`, `consent_request`, `status_reply`, `channel_help`, `voice_received`, `verify_request`. Variables are ticket ids, states and URLs only, never names, places or numbers. Register each template with your DLT operator before going live.

## Missed call → IVR → speech-to-text → ticket
1. The citizen gives a missed call to the state number. The IVR provider calls back.
2. The IVR plays the privacy notice: "press 1 to agree".
3. The IVR records the complaint.
4. It POSTs `{ from, audioBase64, lang: "hi-IN"|"en-IN", consent: true }` to `/api/channels/ivr/recording` with `X-Webhook-Secret: <IVR_WEBHOOK_SECRET_<TENANT>>`.
5. The server stores the audio privately and transcribes it with **Sarvam STT** (India), then files the complaint and sends `voice_received` by SMS.
6. Without an STT key, or on failure, the complaint is filed as "transcription pending" with a `transcription` review task. An officer listens. Nothing is guessed (fail closed).
7. `consent: false` → 428, and nothing is stored.

## WhatsApp
Citizen-initiated only: we reply inside the 24-hour window the citizen opened. Same commands as SMS. Webhook: `/api/channels/whatsapp/inbound` with `X-Webhook-Secret: <WHATSAPP_WEBHOOK_SECRET_<TENANT>>`.

The `cloud-api` driver posts to `WHATSAPP_API_URL` with `WHATSAPP_TOKEN`. **Meta's Cloud API is a foreign service**, so message text leaves India. It is therefore off by default, needs an explicit `EGRESS_ALLOWLIST` entry, and an Indian Business Solution Provider with in-country hosting is preferred. Templates carry no personal data.

## Environment
| Variable | Purpose |
|---|---|
| `SMS_DRIVER`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`, `DLT_ENTITY_ID` | Outbound SMS |
| `INBOUND_SMS_SECRET[_<TENANT>]` | Inbound SMS webhook |
| `VOICE_DRIVER`, `VOICE_API_URL`, `VOICE_API_KEY` | Voice confirmation callbacks |
| `IVR_WEBHOOK_SECRET[_<TENANT>]` | Missed-call recordings |
| `WHATSAPP_DRIVER`, `WHATSAPP_API_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_WEBHOOK_SECRET[_<TENANT>]` | WhatsApp |
