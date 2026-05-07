# SANKALP AI — Comprehensive Feature Documentation

**Version:** SDK 54 / RN 0.81.5  
**Backend:** Express on Railway (https://fiinalszip-production.up.railway.app)  
**Platform:** Android APK via EAS Build (`@sportifykartik/sankalp-ai`)

---

## Table of Contents

1. [Authentication & User Roles](#1-authentication--user-roles)
2. [Home Dashboard](#2-home-dashboard)
3. [Complaint Management](#3-complaint-management)
4. [Announcements](#4-announcements)
5. [Emergency Services Directory](#5-emergency-services-directory)
6. [SOS Emergency System](#6-sos-emergency-system)
7. [Admin Panel](#7-admin-panel)
8. [Push Notifications](#8-push-notifications)

---

## 1. Authentication & User Roles

### Login Flow
- Phone number + 6-digit PIN authentication
- JWT tokens (7-day expiry) stored in SecureStore
- Auto-login on next launch if token valid

### Roles
| Role | Phone Example | Description |
|------|--------------|-------------|
| `citizen` | 9876543210 | Standard user, can file complaints and trigger SOS |
| `admin` | 9999000001 | District admin, manages complaints and sees all SOS alerts |
| `super_admin` | 9000000001 | State-level, sees all districts |

### Demo Accounts (Development)
- Citizen: `9876543210` / PIN `123456` (Arjun Rawat, Dehradun)
- Admin: `9999000001` / PIN `111111` (Dehradun Admin)
- Super Admin: `9000000001` / PIN `000000`

---

## 2. Home Dashboard

### Category Grid
Nine quick-access tiles:
- Roads, Water, Electricity, Waste, Health, Education, Forest, Safety, Other

### Stats Strip
Live counters: Total Complaints · Resolved · Active SOS

### Announcements Preview
Latest 2 announcements from the user's district.

### Quick SOS Button
Floating red button — one tap opens the full SOS screen.

---

## 3. Complaint Management

### Filing a Complaint
1. Select category (9 categories mapped to departments)
2. Enter description
3. Set location (auto or manual text)
4. Select priority: Low / Medium / High / Critical
5. Optionally attach a photo (camera or gallery)
6. Submit → AI priority score computed server-side

### AI Priority Scoring
- Severity keywords boost score (e.g. "hospital", "fire", "flood")
- Photo attachment adds +10 to score
- Multiple upvotes from other citizens add to cluster score
- Score 0–100 displayed as a purple badge on each complaint

### Filter Bar (compact design)
- **Status pills**: All / Pending / In Progress / Resolved
- **Sort pills**: Newest / Oldest / Priority / Upvotes
- **Category pills**: All + 9 category icons (tap to filter)
- Design: `paddingVertical: 3`, `paddingHorizontal: 8`, `fontSize: 10` — intentionally compact

### Complaint Card
- Left colored bar = category color
- Ticket number (e.g. `#CMP-001`)
- Description preview (2 lines)
- Location, AI score badge, upvote count
- Tap → full detail sheet with photo, timeline, status history

### Upvoting
Citizens can upvote complaints in their area to elevate priority.

---

## 4. Announcements

### Types
- `general` · `emergency` · `health` · `infrastructure` · `event`

### Priority Levels
- `normal` · `important` · `urgent`

### Filter Chips (compact)
Type filter chips: paddingHorizontal 9, paddingVertical 4, fontSize 10.

### Urgent Banner
Red pulsing banner at top when urgent announcements exist in district.

---

## 5. Emergency Services Directory

### Service Types
- Hospital · Police Station · Fire Station · Ambulance

### Search & Filter
- Real-time text search across name, address, district
- Type filter chips (compact design: 9px H-padding, 4px V-padding, 11px font)
- District filter row (compact: 9px H-padding, 3px V-padding, 10px font)

### Quick Dials
Prominent row with 100 (Police), 108 (Ambulance), 101 (Fire), 1800-180-4191 (Forest).

### Service Card
- Icon, name, address, availability badge
- Direct call button (opens dialer)
- Tap → detail modal with map, alternate contacts

---

## 6. SOS Emergency System

### 6.1 General SOS (9 Categories)
Categories: Police · Medical · Fire · Flood · Earthquake · Landslide · **Forest Fire** · Women Safety · Other

1. Tap category card
2. Confirm modal shows GPS coordinates + description field
3. Submit → alert created, nearest police stations found (haversine), live GPS streaming starts

**Voice confirmation** on trigger (TTS):  
`"[Category] SOS sent. Emergency services notified. Stay safe."`

**System notification** fires on device with MAX priority.

---

### 6.2 Women Safety SOS (Silent Panic)

Four trigger methods — all silent, police cannot detect from phone:

#### PRIMARY — Volume Up Button (×6)
Physical hardware button. Press 6× fast → panic fires.  
- Real hardware-style button rendered on card + floating edge shortcut
- 6-pip progress bar shows count in real-time

#### Alternative 1 — Tap 6×
Large tap zone card. Count shown in circular display with pip dots.

#### Alternative 2 — Hold 2 Seconds
Hold zone card. Circular fill animation + progress bar on card bottom edge.

#### Alternative 3 — Shake 3×
Accelerometer detects 3 threshold shakes → panic fires.

#### On Panic Trigger:
- `POST /api/sos/women-safety` fires
- Police SSE channel receives `women_safety_sos` event
- Push notification sent to admin(s) in district
- **Audio recording starts automatically** (18-second evidence capture)
- GPS live-streaming begins (updates every 5 seconds)
- Audio upload after recording → stored on server, accessible to admin
- TTS announces: *"Women safety alert sent. Police notified. Stay calm."*

#### Active CPR Patrols Display (live)
When Women Safety SOS is active (panic triggered):
- Nearest 3 CPR patrol vans shown inside the panel
- Each van: van number, officer name, distance, status (ON PATROL / RESPONDING)
- **Live call button** per van → opens phone dialer directly (`tel:` URI)
- Auto-polled every 30 seconds

---

### 6.3 Forest Fire SOS (NEW)

**Panel Location:** Between Women Safety panel and CPR Request button

#### UI Elements
- 🔥 Header card with dark orange gradient (`#1A0800 → #2D1000`)
- Quick-call buttons: Forest Helpline `1800-180-4191` and USDMA `1070`
- Primary button: **REPORT FOREST FIRE — HIGH PRIORITY** (opens confirm modal)

#### Confirm Modal
- GPS badge (live coordinates)
- Description field: describe forest area, nearest village
- Two helpline quick-call buttons inside modal
- **SEND FOREST FIRE ALERT** button (red-orange gradient)

#### Server Flow (`POST /api/sos/forest-fire`)
1. Creates SOS alert with category `forest_fire`
2. Broadcasts via WebSocket to all connected admin clients
3. SSE event emitted to **Forest Department** (`departmentId: "forest"`) — HIGH PRIORITY
4. SSE event emitted to **USDMA** Disaster Management (`departmentId: "usdma"`) — HIGH PRIORITY
5. Expo push notifications sent to district admin(s) + all super admins:
   - Title: `🔥 FOREST FIRE SOS — [DISTRICT]`
   - Body: citizen name + GPS location
6. Response: `{ alert }` with the created alert object

#### On Success (Client)
- `forestSent = true` → panel shows green confirmation card
- Live GPS streaming starts (`startLive(alertId)`)
- Device vibrates: 300ms on, 100ms off, 300ms on, 100ms off, 300ms on
- TTS: *"Forest fire alert sent. Forest Department and Disaster Management notified. Move to safety immediately."*
- System notification: `🔥 Forest Fire SOS Sent`

---

### 6.4 Active CPR Patrols Card (Standalone)

**Panel Location:** Between Nearest Police Stations card and Women Safety panel

- Shown only when at least 1 patrol van has status `active_patrol` or `responding`
- Sorted by proximity (haversine distance from user's GPS)
- Shows nearest 3 vans
- Live polled every 30 seconds (background interval, cleaned up on unmount)
- Each van row: shield icon (blue=patrol, red=responding), van number, officer name, zone/district, distance, **CALL button**
- LIVE green dot badge in card header

---

### 6.5 Triggered State
After any SOS is sent:
- Green live banner: `🟢 LIVE — GPS Streaming Active`
- Triggered card: alert ID, location, departments notified, GPS map button
- "Notified Departments" block lists all responders

---

### 6.6 CPR Patrol Request
Separate card at bottom: **Request CPR Patrol Help**  
Tap → modal with GPS badge + reason field → `POST /api/cpr/user-request`  
Nearest patrol van is dispatched; confirmation TTS fires.

---

## 7. Admin Panel

### 7.1 Reports (Complaints)
- View all complaints district-wide (super admin: all districts)
- Filter pills (compact: 8px H-padding, 3px V-padding, fontSize 11): Status · Category
- Resolve / Reject with feedback note
- View photo evidence, upvote count, AI score, timeline

### 7.2 Workers Leaderboard
- All field workers ranked by performance score
- Filter chips (compact: 9px H-padding, 3px V-padding, fontSize 11): All / Active / On-Leave
- Sort by: Score / Tasks / Rating
- Tap → worker detail modal with task list, performance graph

### 7.3 Audit Log
- Blockchain-style hash chain of all admin actions
- Filter chips (compact: 9px H-padding, 4px V-padding, fontSize 11): All / Create / Update / Resolve / Reject / Delete
- Expand any log entry to see full details + integrity hash

### 7.4 Emergency Services (Admin)
- View + manage all emergency services in district
- Type filter chips (compact: 9px H-padding, 4px V-padding, fontSize 11)
- District filter row (compact: 9px H-padding, 3px V-padding, fontSize 10)
- Add/edit service (name, type, district, address, phone, availability)

### 7.5 SOS Alerts Modal (Admin)
When admin receives a Women Safety or Forest Fire alert:
- Full report modal opens
- Alert category, location, timestamp, citizen details
- Notified departments list
- **Audio Evidence Section**: plays the 18-second recording captured during Women Safety SOS
  - `GET /api/sos/:id/audio-chunks` fetches binary audio data
  - Audio player with play/pause, duration, live badge
  - Evidence chain hash for integrity

---

## 8. Push Notifications

### Setup
- `expo-notifications` with Android notification channel `sos-alerts`
- After login, device registers Expo push token → `POST /api/push-token`
- Token stored server-side with: userId, role, district, platform

### Triggers

| Event | Recipients | Title |
|-------|-----------|-------|
| Women Safety SOS | District admin(s) + all super admins | `🚨 WOMEN SAFETY SOS — [DISTRICT]` |
| Forest Fire SOS | District admin(s) + all super admins | `🔥 FOREST FIRE SOS — [DISTRICT]` |

### Android Channel
- Channel ID: `sos-alerts`
- Importance: MAX
- Sound: default
- Vibration pattern: [0, 250, 250, 250]

### Helpline Numbers in App
| Service | Number |
|---------|--------|
| Police | 100 |
| Ambulance | 108 |
| Fire | 101 |
| Forest Helpline | 1800-180-4191 |
| USDMA Disaster | 1070 |
| Women Helpline | 1091 |
| Child Helpline | 1098 |

---

## Filter Bar Design Reference

All filter pills/chips across the app use a compact design:

| File | Style Name | H-padding | V-padding | Font size |
|------|-----------|-----------|-----------|-----------|
| complaints.tsx | `pill` | 8 | 3 | 10 |
| complaints.tsx | `sortPill` | 7 | 3 | 10 |
| complaints.tsx | `catPill` | 7 | 3 | 10 |
| announcements.tsx | `filterChip` | 9 | 4 | 10 |
| emergency.tsx | `filterChip` | 9 | 4 | 11 |
| admin/reports.tsx | `pill` | 8 | 3 | 11 |
| admin/workers.tsx | `filterChip` | 9 | 3 | 11 |
| admin/audit.tsx | `filterChip` | 9 | 4 | 11 |
| admin/emergency.tsx | `filterChip` | 9 | 4 | 11 |
| admin/emergency.tsx | `districtChip` | 9 | 3 | 10 |

---

## Backend API Reference (Key Endpoints)

### SOS
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sos/women-safety` | Trigger Women Safety SOS |
| POST | `/api/sos/forest-fire` | Trigger Forest Fire SOS (NEW) |
| GET | `/api/sos/alerts` | List all SOS alerts (admin) |
| GET | `/api/sos/:id/audio-chunks` | Get audio evidence (admin) |
| PUT | `/api/sos/:id/audio-url` | Update audio URL after upload |

### CPR
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cpr/patrols` | Active patrol vans (live-polled) |
| POST | `/api/cpr/user-request` | Request CPR patrol dispatch |

### Complaints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/complaints` | List complaints (district-filtered) |
| POST | `/api/complaints` | File new complaint |
| PUT | `/api/complaints/:id/status` | Update status (admin) |
| POST | `/api/complaints/:id/upvote` | Upvote complaint |

### Push
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/push-token` | Register device push token |
| DELETE | `/api/push-token` | Deregister on logout |
