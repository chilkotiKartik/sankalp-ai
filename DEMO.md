# SANKALP AI — Live demo script (P0.b)

Everything below runs in **demo mode**. A **DEMO · simulated data** badge is visible on every screen. The accounts use placeholder numbers (`9000000001`…), not real people.

## 0. Prepare (10 minutes before)

1. Create a `.env` file with two different random secrets of at least 32 characters each:
   ```bash
   printf 'JWT_SECRET=%s\nDEPT_JWT_SECRET=%s\nDEMO_MODE=true\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
   ```
2. Seed demo data. This also resets everything and prints the demo PIN and department codes:
   ```bash
   npm run seed:demo
   ```
   The credentials are also saved in `data/demo-credentials.txt`. Keep that file open on a second screen; never project it.
3. Start the server:
   ```bash
   npm run server
   ```
4. Check the whole path end to end. It must print `SMOKE PASSED`:
   ```bash
   SMOKE_BASE_URL=http://localhost:5000 npm run smoke
   ```
5. Open these tabs:
   - Citizen app: `http://localhost:5000/` (the web build), or Expo Go on a phone.
   - Department portal: `http://localhost:5000/web/dept`
   - Police CPR console: `http://localhost:5000/web/cpr`
   - Public dashboard: `http://localhost:5000/web/public`

## 1. Citizen reports a pothole (2 minutes)

1. **App** → sign in as the demo citizen `9000000001` with the PIN from the credentials file. (In demo mode, the login screen lets you tap a placeholder account to fill the number.)
2. **Complaints → +**. Describe "Deep pothole near the school gate". The category suggestion switches to *Pothole*.
3. Tap **Use GPS**. This sends the device's real coordinates; nothing is randomised any more.
4. Attach a photo. The app uploads it first. Because no sovereign vision model is configured, it says *"an officer will review it"*. That is deliberate: the system fails closed.
5. **Submit**. Point out the ticket ID and **routed to PWD (rules: category → department)**, which is the AI routing explanation.

## 2. Department resolves with proof (2 minutes)

1. **Dept portal** → choose *PWD*, then enter the `pwd` code from the credentials file. Codes are random and rotatable; the old `pwd_2026` style codes no longer work.
2. The new complaint appears at the top. Open it, then **Assign Worker** (any placeholder phone, e.g. `9000012345`). A one-time PIN is shown once and never stored.
3. Set **Update Status** to **Fixed — submit proof photo**, attach a photo and save.
4. Explain: officers **cannot close** the case. It is now *Fix submitted, awaiting the citizen*.

## 3. Citizen confirms, case closes (1 minute)

1. **App** → open the complaint. The **Before / After** panel shows the real photos.
2. Tap **Yes, it is fixed — confirm & rate**. The status becomes **Closed (citizen-verified)**.
3. (Optional) Show **Not fixed — reopen**. Each rejection reopens the case, and the third rejection escalates it.

## 4. Public dashboard (1 minute)

**Public dashboard** shows PWD's resolved count go up. Every figure shows its formula and `n`, and grades show *insufficient data* when n < 10. No names or phone numbers appear.

## 5. Women-safety SOS → police console (2 minutes)

1. **CPR console** → sign in with *Control-room access code*, unit *Uttarakhand Police*, using the `police` code. Without signing in, the console shows nothing (it used to be public).
2. **App** → **SOS** tab → tap the shield **6 times within 3 seconds** (or press and hold). The app only says *"Your SOS has reached the police control room"* **after** the server confirms.
3. The console shows the incident with live location. Other citizens' phones receive nothing, because victim data goes only to police and district staff.
4. Tap again: it is **de-duplicated**, never rate-limited.

## Recovery (if something fails on stage)

| Symptom | Fix |
|---|---|
| Server exits with "Invalid configuration" | `.env` is missing `JWT_SECRET` / `DEPT_JWT_SECRET`, or they are too short or identical. Re-run step 0.1. |
| Login says "Invalid phone or PIN" | Re-check the PIN in `data/demo-credentials.txt`. Each seed generates a new one. |
| Dept / CPR code rejected | Codes change on every seed. Use the latest file. |
| No DEMO badge, data missing | The server was started without `DEMO_MODE=true`, so demo data was purged. Fix `.env`, then run `npm run seed:demo` and restart. |
| 429 "Too many attempts" | The login limit is 8 tries per number per 15 minutes. Restart the server to clear the in-memory limiter, or wait. |
| Map has no background | No `MAP_TILE_URL` is set. Markers still work. In development, OSM tiles are used automatically. |
| Photo upload rejected | Only JPEG, PNG or WebP images up to 8 MB are accepted (the content is checked, not the file name). |
| Anything else | `npm run seed:demo` (full reset), restart, then `npm run smoke`. |

> Not tested here: a physical Android or iOS device (shake, volume and power-button triggers, secure-store and camera behaviour). Run the SOS triggers on the actual demo phone before the event.
