# SANKALP AI — Best Features Guide

**SANKALP AI** is a production-grade civic governance platform for all 13 districts of Uttarakhand.

---

## 1. Real-Time SOS & Emergency System

### Women Safety — 5 Panic Trigger Methods
The app's most critical feature — one touch away from help, even without typing:

| Method | How to activate |
|--------|----------------|
| 6-Tap | Tap the shield card 6 times within 3 seconds |
| Long-Hold | Press and hold the shield for 2 seconds (ring fills as progress) |
| Volume Button | On-screen hardware-style button — 6 presses within 4 seconds |
| Shake | Shake phone 5× rapidly (native only, accelerometer-based) |
| Voice | Say "help me" or "bachao" (Speech Recognition, native only) |

**On trigger:** voice alert plays, phone vibrates in SOS pattern, 2 nearest police stations auto-notified with live GPS, 18-second audio recording captured and uploaded as evidence, CPR Safety Command incident auto-created, real-time WebSocket broadcast to all connected admin portals.

### General SOS Categories
Gas Leak · Water Burst · Electric Hazard · Fire Risk · Road Accident · Women Safety · Medical Emergency · Infrastructure · Natural Disaster · Forest Fire

### Forest Fire SOS
Direct escalation to Forest Department (1800-180-4191) and USDMA (1070), with live GPS coordinates and voice evacuation guidance.

### PCR Patrol Request
Browse nearest active patrol vans, send an immediate help request with one tap. Shows van number, officer name, and distance.

---

## 2. Live GPS — No Hardcoded Coordinates

Every location-sensitive action uses **real GPS**, not a hardcoded city:

- **Native**: `expo-location` → `requestForegroundPermissionsAsync` → `watchPositionAsync` (5-second interval, 10-metre threshold)
- **Web**: `navigator.geolocation.watchPosition` with high-accuracy mode
- **Fallback chain**: Real GPS → User's own district centre (from profile) — if you are from Champawat, fallback goes to Champawat, not Delhi or Dehradun
- **SOS live tracking**: location pushed every 5 seconds to admin portals while an active alert exists
- **Map live tracking**: GPS marker updates as you move — recenter button snaps to your actual position

---

## 3. Interactive Uttarakhand Map

A full Leaflet.js map (CartoDB light tiles) with 7 filterable data layers:

| Filter | Shows |
|--------|-------|
| All | Everything at once |
| Issues | Complaints coloured by priority (P1 red → P4 grey) |
| SOS | Active emergencies |
| Workers | Active field workers on duty |
| Police | All 28 police stations across 13 districts — tap to call |
| Risks | Flood / crime / infrastructure risk zones with radius circles |
| Hospitals | District hospitals with bed count, tap to call |
| Fire Stns | Fire stations, tap to call |

**Your Location**: Orange GPS dot — map auto-centres on your real position. Recenter button snaps back to GPS (not district centre) when location is available. Works on Android, iOS (WebView + Leaflet), and web.

---

## 4. AI Civic Assistant (OpenAI GPT-4o-mini)

Three-tier AI chain, zero downtime:

1. **OpenAI GPT-4o-mini** (primary) — context-aware, conversational, bilingual
2. **Groq LLaMA 3.1 8B** (secondary fallback)
3. **NVIDIA LLaMA 3.1** (tertiary fallback)
4. **Local rule-based engine** (always-on final fallback)

**Live data injected into every conversation:**
- Your district's complaint count, resolution rate, active SOS count
- Best and worst ward health scores
- All government helplines: UPCL (1912), Jal Sansthan (1916), PWD (1800-180-4244)
- Government schemes: CM Swarojgar, Gaura Devi Kanya Dhan (₹51,000 for girls), Ayushman Bharat
- Char Dham pilgrimage routes, road conditions, disaster management contacts

**AI Image Analysis**: Photograph any civic issue → AI identifies severity, issue type, responsible department, estimated fix time, and priority (P1–P4).

**Personality**: Warm and conversational, not robotic. Mixes Hindi naturally — Namaste, ji, Devbhoomi, dhanyavaad. Replies in under 250 words. Emergency numbers always come first when safety is at risk.

---

## 5. Complaint Management

- **8 categories**: Pothole, Garbage, Streetlight, Water Issue, Drain/Sewer, Electricity, Tree/Park, Other
- **AI photo analysis**: Upload a photo → AI auto-fills severity, category, priority
- **Unique ticket IDs**: Every complaint gets a trackable ticket (e.g. `CMP-A3F2E1`)
- **Real-time status**: pending → in_progress → resolved, with admin notes at each step
- **Upvote system**: Citizens can upvote to escalate high-priority complaints
- **Resolution flow**: Citizen rates resolution 1–5 stars and uploads "after" photo
- **Department SSE**: Complaint instantly appears in the relevant department portal

---

## 6. Gamification & Leaderboard

- 20-citizen leaderboard spanning all 13 districts
- Points for filing complaints, getting them resolved, upvoting, community engagement
- Levels 1–10 with badges: First Report, Active Citizen, Civic Hero, City Champion
- Your own entry highlighted with saffron border and "You" badge
- District column shows where each citizen is from

---

## 7. Four Web Portals (React 18 CDN, zero build step)

### Unified Governance Portal (`/web/portal`)
Complete admin dashboard — complaints, SOS alerts, workers, analytics, emergency broadcast.

### Department Portal (`/web/dept`)
Real-time SSE stream — new complaints flash as they arrive. KPIs, worker management, live SOS tab. Access code: `{deptId}_2026` (e.g. `pwd_2026`).

### CPR Safety Command (`/web/cpr`)
Interactive Leaflet map with all 15 patrol vans streaming live GPS. Women safety incidents auto-created and streamed. Officer leaderboard ranked by resolved incidents and response rate.

### Public Civic Dashboard (`/web/public`)
Live stats with no login — total complaints, resolved, pending, active SOS. Useful for press and transparency.

### RTI Filing Portal (`/web/rti`)
AI-generated RTI draft → submission → 30-day deadline tracking → status progression (filed → acknowledged → replied → closed).

---

## 8. Ward Health Score System

Every block/ward gets a health score (0–100) based on:
- Open complaint density
- Resolution rate
- Active SOS count
- Population weighting

Shown on the home screen and map as coloured score pills. Worst and best ward surfaced in AI prompt live.

---

## 9. Real-Time Infrastructure

| Channel | Purpose |
|---------|---------|
| WebSocket Server | Live SOS broadcast to all portals + app simultaneously |
| SSE `deptEmitter` | Complaints → Department Portal in real time |
| SSE `cprEmitter` | SOS + patrol GPS → CPR Command in real time |
| Worker GPS Stream | Simulated field worker movement at `/api/workers/stream` |
| Expo Push Notifications | Complaint status updates sent to citizen's phone |

---

## 10. Emergency Directory

- Quick-dial grid: 112, 100, 108, 1090, 1070, 1905 — one tap to call
- Tabbed service list: Police, Medical, Fire, Disaster, Helplines
- District hospitals, ambulances, fire stations with call button
- Map tab shows all nearest services

---

## 11. Bilingual Support

- AI mixes Hindi naturally in every reply
- Voice alerts use `en-IN` Indian English
- Hindi keywords trigger correct responses: नमस्ते, पानी, बिजली, महिला
- All district names, ward names, helplines in local Uttarakhand context

---

## 12. RTI Module

- AI drafts RTI application from a plain-language description
- Covers all Uttarakhand departments
- 30-day statutory deadline auto-tracked
- Status: filed → acknowledged → replied → closed

---

## 13. Budget Transparency

- 104 budget line items across all 13 districts
- Allocated vs. spent with percentage bars
- Filterable by district and department

---

## 14. Security

- Phone + 6-digit PIN login
- JWT tokens (24-hour expiry)
- Roles: citizen / district_admin / super_admin
- Rate limiting: AI (30 req/min), SOS (10 req/min)
- All routes protected by auth middleware

---

## Demo Credentials

| Role | Phone | PIN |
|------|-------|-----|
| Citizen — Champawat, Rank #17 | `9876543210` | `123456` |
| Super Admin | `9999999999` | `000000` |
| Dept Portal (PWD) | Code: `pwd_2026` | — |
| Dept Portal (Police) | Code: `police_2026` | — |
| CPR Portal | Code: `cpr_2026` | — |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | Expo ~54 + React Native 0.81.5 + Expo Router |
| Web Portals | React 18 CDN + Babel Standalone (no build) |
| Backend | Express.js + TypeScript |
| Database | In-memory (prototype/demo) |
| Maps | Leaflet.js 1.9.4 + CartoDB Light tiles |
| AI | OpenAI GPT-4o-mini → Groq LLaMA → NVIDIA LLaMA → Local |
| Real-time | WebSocket (ws) + SSE (Node.js EventEmitter) |
| Push | Expo Push Notifications Server SDK |
| Voice | expo-speech (TTS) + expo-av (recording) |
| GPS | expo-location (native) + navigator.geolocation (web) |
