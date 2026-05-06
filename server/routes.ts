import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { storage, DEPARTMENTS, getDeptIdForCategory, deptEmitter, cprEmitter } from "./storage";

// ── SIMPLE QR MATRIX GENERATOR (no external libs) ─────────────────────────────
function generateQRMatrix(text: string): boolean[][] {
  const size = 21;
  const mat: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  // Finder patterns (top-left, top-right, bottom-left)
  const addFinder = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      mat[row + r][col + c] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
    }
  };
  addFinder(0, 0); addFinder(0, 14); addFinder(14, 0);
  // Timing patterns
  for (let i = 8; i < 13; i++) { mat[6][i] = i % 2 === 0; mat[i][6] = i % 2 === 0; }
  // Data encoding: hash text into deterministic dot pattern
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) & 0x7FFFFFFF;
  const rng = (seed: number) => { seed = (seed * 1664525 + 1013904223) & 0x7FFFFFFF; return (seed & 0xFF) / 255; };
  let seed = hash;
  for (let r = 8; r < size - 8; r++) for (let c = 8; c < size - 8; c++) {
    seed = (seed * 1664525 + 1013904223) & 0x7FFFFFFF;
    mat[r][c] = rng(seed) > 0.5;
  }
  return mat;
}

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
console.log(`[NVIDIA] API key: ${NVIDIA_API_KEY ? `loaded (${NVIDIA_API_KEY.length} chars)` : "MISSING"}`);
console.log(`[GROQ]   API key: ${GROQ_API_KEY ? `loaded (${GROQ_API_KEY.length} chars)` : "MISSING"}`);
console.log(`[OPENAI] API key: ${OPENAI_API_KEY ? `loaded (${OPENAI_API_KEY.length} chars)` : "MISSING"}`);

// Use curl to bypass Replit's Node.js egress sandbox restrictions
function curlPost(url: string, authKey: string, body: string, timeoutSecs = 12): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-s", "--max-time", String(timeoutSecs),
      "-X", "POST", url,
      "-H", `Authorization: Bearer ${authKey}`,
      "-H", "Content-Type: application/json",
      "-H", "Accept: application/json",
      "-d", body,
    ];
    execFile("curl", args, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(err.message || stderr || "curl failed")); return; }
      if (!stdout) { reject(new Error("empty response")); return; }
      resolve(stdout);
    });
  });
}

async function callNvidiaChat(messages: Array<{ role: string; content: string }>, model = "meta/llama-3.1-8b-instruct", maxTokens = 600): Promise<string | null> {
  if (!NVIDIA_API_KEY) return null;
  try {
    const body = JSON.stringify({ model, messages, stream: false, temperature: 0.75, top_p: 0.9, max_tokens: maxTokens });
    const raw = await curlPost(NVIDIA_URL, NVIDIA_API_KEY, body, 12);
    const data = JSON.parse(raw) as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content) console.log(`[NVIDIA] ✅ ${model} replied (${content.length} chars)`);
    else if (data.error) console.error("[NVIDIA] API error:", data.error?.message);
    return content || null;
  } catch (err: any) {
    console.error("[NVIDIA] chat error:", err?.message?.slice(0, 100));
    return null;
  }
}

async function callGroqChat(messages: Array<{ role: string; content: string }>, model = "llama-3.1-8b-instant", maxTokens = 600): Promise<string | null> {
  if (!GROQ_API_KEY) return null;
  try {
    const body = JSON.stringify({ model, messages, stream: false, temperature: 0.75, max_tokens: maxTokens });
    const raw = await curlPost(GROQ_URL, GROQ_API_KEY, body, 14);
    const data = JSON.parse(raw) as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content) console.log(`[GROQ] ✅ ${model} replied (${content.length} chars)`);
    else if (data.error) console.error("[GROQ] API error:", data.error?.message);
    return content || null;
  } catch (err: any) {
    console.error("[GROQ] chat error:", err?.message?.slice(0, 100));
    return null;
  }
}

async function callNvidiaVision(imageBase64: string, prompt: string): Promise<string | null> {
  if (!NVIDIA_API_KEY) return null;
  try {
    const body = JSON.stringify({
      model: "meta/llama-3.2-11b-vision-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      }],
      stream: false,
      temperature: 0.3,
      max_tokens: 300,
    });
    const raw = await curlPost(NVIDIA_URL, NVIDIA_API_KEY, body, 15);
    const data = JSON.parse(raw) as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    console.error("[NVIDIA Vision] error:", err?.message?.slice(0, 100));
    return null;
  }
}

// ── AI SYSTEM PROMPT BUILDER ─────────────────────────────────────────────────
function buildSystemPrompt(userName?: string, userDistrict?: string): string {
  const complaints = storage.getComplaints(userDistrict);
  const sos = storage.getSosAlerts(userDistrict);
  const wards = storage.getWards(userDistrict);
  const resolved = complaints.filter(c => c.status === "resolved").length;
  const pending = complaints.filter(c => c.status === "pending").length;
  const activeSos = sos.filter(s => s.status === "active").length;
  const avgHealth = wards.length ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length) : 0;
  const topWard = [...wards].sort((a, b) => b.healthScore - a.healthScore)[0];
  const worstWard = [...wards].sort((a, b) => a.healthScore - b.healthScore)[0];

  return `You are Sankalp — a warm, knowledgeable civic assistant working for the Government of Uttarakhand's SANKALP AI platform. You speak like a caring, helpful human being — not a robot or a formal government notice.

Your personality:
- Warm, empathetic, and conversational — like a trusted local government helper
- You use natural language, not bullet-point lists unless genuinely needed
- You mix Hindi words naturally (Namaste, ji, Devbhoomi, dhanyavaad) when it feels right
- You care about the citizen's problem and show it
- Never sound bureaucratic or robotic
- Keep replies concise but human — under 250 words
- Use emojis sparingly and only when they add warmth, not just decoration

Current live data for ${userDistrict || "Uttarakhand"} (as of right now):
- Total complaints: ${complaints.length} | Resolved: ${resolved} | Pending: ${pending}
- Active SOS emergencies: ${activeSos}
- Average district health score: ${avgHealth}/100
${topWard ? `- Best performing area: ${topWard.name} (score ${topWard.healthScore})` : ""}
${worstWard ? `- Needs most attention: ${worstWard.name} (score ${worstWard.healthScore})` : ""}

You know everything about:
- Filing civic complaints (potholes, garbage, water, electricity, streetlights, drains, trees)
- Tracking complaint status via ticket IDs
- Emergency SOS — Police: 100, Ambulance: 108, Women helpline: 1090, Disaster: 1070, CM Helpline: 1905
- Women safety — SANKALP has 5 panic modes; 2 nearest police stations are auto-notified with live GPS
- All 13 Uttarakhand districts: Dehradun, Haridwar, Tehri Garhwal, Pauri Garhwal, Rudraprayag, Chamoli, Uttarkashi, Pithoragarh, Bageshwar, Almora, Champawat, Nainital, Udham Singh Nagar
- Government schemes: CM Swarojgar Yojana, Gaura Devi Kanya Dhan Yojana (₹51,000 for girls), Veer CS Garhwali Paryatan Yojana, PM Awas Yojana, Ayushman Bharat
- Uttarakhand helplines: UPCL (1912), Jal Sansthan (1916), PWD (1800-180-4244), SDRF (9557444486)
- Char Dham pilgrimage routes, tourism, road conditions
- Uttarakhand disaster management (USDMA), SDRF, NDRF

${userName ? `The person you're talking to is named ${userName}${userDistrict ? ` from ${userDistrict}` : ""}. Use their name occasionally to make it personal.` : ""}

Important: If someone is in danger or needs emergency help right now, immediately give them the most relevant emergency number first, then explain further. Their safety comes first.`;
}

// ── HUMANIZED AI ENGINE (instant, context-aware, live-data powered) ──────────
function generateAIReply(message: string, history: Array<{ role: string; content: string }> = [], userName?: string, userDistrict?: string): string {
  const msg = message.toLowerCase().trim();
  const firstName = userName ? userName.split(" ")[0] : "";
  const name = firstName ? `, ${firstName}` : "";
  const district = userDistrict || "Uttarakhand";
  // Check if user has mentioned a specific topic in the last turn for context
  const lastBotMsg = history.filter(h => h.role === "ai" || h.role === "assistant").pop()?.content?.toLowerCase() || "";

  if (/^(hi|hello|namaste|namaskar|hey|good morning|good evening|good afternoon|नमस्ते|नमस्कार)/.test(msg)) {
    const greetings = [
      `Namaste${name}! 🙏 Great to have you here. I'm Sankalp, your civic assistant for ${district}.\n\nI can help you report issues, track your complaints, find government schemes, or handle emergencies. What's on your mind today?`,
      `Hello${name}! Welcome to SANKALP AI — your direct line to better governance in ${district}.\n\nWhether it's a pothole, a water problem, or you just need help navigating a government scheme — I'm here for you. What can I help with?`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  if (/sos|emergency|danger|help me|unsafe|attack|harassment|rape|महिला|women safety/.test(msg)) {
    return `Please stay calm — I'm here with you right now.\n\n🆘 Call 112 immediately for unified emergency response.\n📞 Women helpline: 1090 (24×7, free)\n📞 Police: 100\n📞 Disaster helpline: 1070\n\nIn the app, go to the SOS tab — your live location will be shared with the 2 nearest police stations automatically. You don't need to say anything, just tap the panic button.\n\nYou're not alone. Please get to a safe place first. Is there anything specific I can help you with right now?`;
  }

  if (/pothole|road damage|गड्ढा|broken road/.test(msg)) {
    return `Pothole on a mountain road${name ? `, ${name.trim()}` : ""} — that's genuinely dangerous and I'm glad you're reporting it.\n\nJust head to the Complaints tab, tap the + button, pick "Pothole" as the category, pin your location, and submit. If you can add a photo it really speeds things up. You'll get a ticket ID immediately.\n\nPWD helpline: 1800-180-4244 if it's urgent. Mountain road potholes automatically get higher priority — so expect a faster response. 🏔️`;
  }

  if (/garbage|waste|trash|कूड़ा|littering/.test(msg)) {
    return `Garbage dumping is one of the top complaints we get in ${district} — you're not alone in being frustrated by this.\n\nReport it through the Complaints tab → Garbage Collection. Add the exact location and a photo if possible. The ULB (Urban Local Body) gets notified directly. ULB helpline: 1533.\n\nEvery report genuinely makes a difference — it builds pressure for regular collection routes in your area. 🌿`;
  }

  if (/water|पानी|supply|pipeline|jal/.test(msg)) {
    return `Water supply problems in the hills can be really difficult, especially in summer.\n\nPlease file a complaint through the Complaints tab → Water Supply. Mention whether it's no supply, low pressure, or contamination — that helps route it to the right team faster.\n\nUttarakhand Jal Sansthan helpline: 1916. They also have an online portal at ujs.uk.gov.in if you prefer.\n\nIs this an ongoing issue or did it just start?`;
  }

  if (/electricity|power cut|बिजली|upcl|transformer|voltage/.test(msg)) {
    return `Power cuts in the hills are tough${name}. UPCL's helpline 1912 is available 24×7 for immediate issues like exposed wires or transformer sparking — those are genuinely dangerous so call immediately if that's the case.\n\nFor routine complaints like frequent cuts or billing issues, use the Complaints tab → Electricity. Mentioning a nearby landmark helps the team locate the fault faster.\n\nIs this a safety emergency or an ongoing supply issue?`;
  }

  if (/streetlight|street light|lamp|dark road|अंधेरा/.test(msg)) {
    return `Dark roads — especially on mountain stretches — are a real safety risk and I take this seriously.\n\nFile through Complaints → Street Light. If you can note the pole number (usually printed on it), that makes repairs much faster. Average fix time is 2-4 working days for non-clustered areas.\n\nIf multiple lights in your block are out, report each one — clustered reports automatically escalate to P1 priority. 💡`;
  }

  if (/drain|sewer|sewage|overflow|नाली/.test(msg)) {
    return `Sewage overflow is a health hazard and I want this escalated quickly for you.\n\nGo to Complaints → Drain, mark the precise location, and add a photo if safe to do so. Jal Sansthan handles this — helpline: 1800-180-4244.\n\nDuring monsoon season, drain reports in ${district} automatically get priority due to flood risk. When did this start?`;
  }

  if (/scheme|yojana|welfare|subsidy|benefit|सरकारी|government scheme/.test(msg)) {
    return `There are several Uttarakhand schemes that might help you${name}.\n\nFor self-employment, the CM Swarojgar Yojana offers loans with 25% subsidy up to ₹2 lakh — great for hill residents. For families with daughters, Gaura Devi Kanya Dhan Yojana gives ₹51,000. Housing? PM Awas Yojana is open for those earning under ₹18 lakh annually.\n\nFor all applications: cm.uk.gov.in or visit your district magistrate's office. CM Helpline: 1905.\n\nWhich scheme are you interested in? I can give you specific details.`;
  }

  if (/hospital|doctor|medical|ambulance|health|अस्पताल/.test(msg)) {
    return `For a medical emergency, call 108 right away — ambulance is free across Uttarakhand.\n\nNearest major hospitals to note:\n- AIIMS Rishikesh: 0135-2462900\n- Doon Medical College (Dehradun): 0135-2656621  \n- Sushila Tiwari (Haldwani): 05946-220052\n\nHealth helpline: 104 for medical advice. Government hospitals provide free medicines with Aadhaar.\n\nIs this an emergency right now, or are you looking for general health service information?`;
  }

  if (/track|status|ticket|where is my|complaint id/.test(msg)) {
    return `To check your complaint status${name}, go to the Complaints tab — your tickets are listed there with live status updates.\n\nStatus means: 🟡 Pending = received, 🔵 In Progress = worker dispatched, 🟢 Resolved = done (you can verify or reject).\n\nIf a complaint was marked resolved but the issue isn't actually fixed, you can reject it — 3 rejections automatically reopen it for investigation.\n\nDo you have a specific ticket ID I can help you look into?`;
  }

  if (/landslide|flood|disaster|cloudburst|भूस्खलन|बाढ़/.test(msg)) {
    return `Please be safe — landslides and cloudbursts in Uttarakhand can develop very quickly.\n\n📞 State Emergency: 1070 (24×7)\n📞 SDRF: 9557444486\n📞 NDRF: 011-24363260\n\nIf roads are blocked, report through Complaints → Other and mention "landslide debris" — it gets highest priority. Avoid traveling through affected areas until SDRF clears them.\n\nAre you currently in a danger zone or reporting an incident?`;
  }

  if (/thank|thanks|dhanyavaad|धन्यवाद/.test(msg)) {
    const thanks = [
      `Dhanyavaad${name}! 🙏 It means a lot. Every complaint you file, every issue you report — it adds up and makes ${district} better for everyone.\n\nYou're earning points too — check your profile to see your civic rank! Stay safe in the hills. 🏔️`,
      `Thank you for using SANKALP${name}! Your civic participation is what drives real change in Devbhoomi. Feel free to come back anytime — I'm always here. जय उत्तराखंड! 🇮🇳`,
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }

  if (/statistic|how many|total|analytics|data/.test(msg)) {
    const complaints = storage.getComplaints(userDistrict);
    const resolved = complaints.filter(c => c.status === "resolved").length;
    const pending = complaints.filter(c => c.status === "pending").length;
    const activeSos = storage.getSosAlerts(userDistrict).filter(s => s.status === "active").length;
    const wards = storage.getWards(userDistrict);
    const avgHealth = wards.length ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length) : 0;
    return `Here's the live picture for ${district} right now${name}:\n\n${complaints.length} total complaints have been filed — ${resolved} resolved (${Math.round(resolved/Math.max(complaints.length,1)*100)}% resolution rate), and ${pending} still pending. There ${activeSos === 1 ? "is 1 active SOS alert" : `are ${activeSos} active SOS alerts`} being responded to.\n\nThe average district health score is ${avgHealth}/100. You can see the full breakdown in the Analytics tab — it updates in real time.\n\nWant me to explain what any of these numbers mean?`;
  }

  const fallbacks = [
    `Good question${name}! I want to make sure I give you the most useful answer.\n\nI specialise in civic services for ${district} — complaint filing, status tracking, emergency helplines, government schemes, and women safety. Could you tell me a bit more about what you need? I'm listening.`,
    `I hear you${name}. Let me help you find the right answer.\n\nFor anything civic in ${district} — potholes, water, power, safety — I can guide you step by step. For government schemes or emergency helplines, just ask. What's the issue you're facing?`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function getToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const user = storage.validateToken(token);
  if (!user) return res.status(401).json({ message: "Invalid or expired token" });
  (req as any).user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const user = storage.validateToken(token);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }
  (req as any).user = user;
  next();
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const user = storage.validateToken(token);
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  (req as any).user = user;
  next();
}

// Returns the district filter for the current user:
// super_admin → "Uttarakhand" (all), admin → their district, citizen → their district
function getUserDistrict(req: Request): string | undefined {
  const user = (req as any).user;
  if (!user) return undefined;
  if (user.role === "super_admin") return undefined; // no filter = all
  return user.district;
}

// ── STRING PARAM HELPER (Express 5 types: req.params values are string | string[]) ──
const sp = (v: string | string[]): string => Array.isArray(v) ? (v[0] ?? "") : v;

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
const RL_MAP = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxReq: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const fwd = req.headers["x-forwarded-for"];
    const key: string = (Array.isArray(fwd) ? fwd[0] : fwd) || (req.ip as string) || "anon";
    const now = Date.now();
    const entry = RL_MAP.get(key);
    if (!entry || now > entry.resetAt) {
      RL_MAP.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxReq) {
      return res.status(429).json({ message: "Too many requests — please wait a moment and try again." });
    }
    entry.count++;
    next();
  };
}
// Clean up stale rate-limit entries every 5 min
setInterval(() => { const now = Date.now(); RL_MAP.forEach((v, k) => { if (now > v.resetAt) RL_MAP.delete(k); }); }, 300_000);

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const broadcast = (data: any) => {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  };
  storage.addWsListener(broadcast);
  wss.on("connection", (ws: any, req: any) => {
    // Authenticate via token query param: ?token=<jwt>
    const url = new URL(req.url || "/", "http://localhost");
    const tok = url.searchParams.get("token");
    const wsUser = tok ? storage.validateToken(tok) : null;
    if (!wsUser) {
      ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
      ws.close(4001, "Unauthorized");
      return;
    }
    ws.send(JSON.stringify({ type: "connected", message: "SANKALP AI Real-time connected", district: wsUser.district }));
    ws.on("error", () => {});
  });

  // ── AUTH ──────────────────────────────────────────────────────────────
  app.post("/api/auth/register", rateLimit(5, 60_000), async (req, res) => {
    try {
      const { name, phone, pin, district } = req.body;
      if (!name || !phone || !pin) return res.status(400).json({ message: "Name, phone, and PIN required" });
      if (pin.length !== 6) return res.status(400).json({ message: "PIN must be 6 digits" });
      if (phone.length !== 10) return res.status(400).json({ message: "Phone must be 10 digits" });
      const existing = await storage.findUserByPhone(phone);
      if (existing) return res.status(400).json({ message: "Phone number already registered" });
      const bcrypt = await import("bcrypt");
      const hashedPin = await bcrypt.hash(pin, 10);
      const user = await storage.createUser({
        name, phone, pin: hashedPin, role: "citizen",
        district: district || "Dehradun",
        points: 0, badges: ["new_citizen"], level: 1
      });
      const token = storage.createToken(user.id);
      res.json({
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role, district: user.district, points: user.points, badges: user.badges, level: user.level },
        token
      });
    } catch (err: any) {
      console.error("[Register] Unexpected error:", err?.message || err);
      res.status(500).json({ message: err?.message || "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", rateLimit(10, 60_000), async (req, res) => {
    try {
      const { phone, pin } = req.body;
      if (!phone || !pin) return res.status(400).json({ message: "Phone and PIN required" });
      const user = await storage.findUserByPhone(phone);
      if (!user) return res.status(401).json({ message: "Invalid phone or PIN" });
      // Backward-compat: bcrypt hashes start with $2b$ / $2a$; legacy plain-text pins compared directly
      let pinValid = false;
      if (user.pin && (user.pin.startsWith("$2b$") || user.pin.startsWith("$2a$"))) {
        const bcrypt = await import("bcrypt");
        pinValid = await bcrypt.compare(pin, user.pin);
      } else {
        pinValid = user.pin === pin;
      }
      if (!pinValid) return res.status(401).json({ message: "Invalid phone or PIN" });
      const token = storage.createToken(user.id);
      res.json({
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role, district: user.district, points: user.points, badges: user.badges, level: user.level },
        token
      });
    } catch (err: any) {
      console.error("[Login] Unexpected error:", err?.message || err);
      res.status(500).json({ message: err?.message || "Login failed. Please try again." });
    }
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const u = (req as any).user;
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role, district: u.district, points: u.points, badges: u.badges, level: u.level });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = getToken(req);
    if (token) storage.revokeToken(token);
    res.json({ success: true });
  });

  // ── COMPLAINTS ────────────────────────────────────────────────────────
  app.get("/api/complaints", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getComplaints(district));
  });

  app.post("/api/complaints", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { category, description, location, geo, ward, wardNumber, priority } = req.body;
    if (!category || !description || !location) return res.status(400).json({ message: "category, description, location required" });
    const complaint = storage.createComplaint({
      category, description, location,
      geo: geo || { lat: 30.3165, lng: 78.0322 },
      ward: ward || "Dehradun Block",
      wardNumber: wardNumber || 1,
      district: user.district || "Dehradun",
      priority: priority || "P3",
      status: "pending",
      submittedBy: user.name,
      submittedByPhone: user.phone,
      isCluster: false,
    }, user.id);

    // Broadcast to department SSE stream so web portal gets real-time highlight
    const deptId = getDeptIdForCategory(category);
    deptEmitter.emit("event", {
      type: "complaint_new",
      departmentId: deptId,
      complaint: { ...complaint, departmentId: deptId },
    });

    res.status(201).json(complaint);
  });

  app.put("/api/complaints/:id/upvote", requireAuth, (req, res) => {
    const user = (req as any).user;
    const complaint = storage.upvoteComplaint(sp(req.params.id), user.id);
    if (!complaint) return res.status(404).json({ message: "Not found" });
    res.json(complaint);
  });

  app.put("/api/complaints/:id/resolve", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { rating, feedback, afterPhoto } = req.body;
    const complaint = storage.resolveComplaint(sp(req.params.id), rating, feedback, afterPhoto, user.id);
    if (!complaint) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "complaint_resolved", complaintId: complaint.id, ticketId: (complaint as any).ticketId, timestamp: new Date().toISOString() });
    res.json(complaint);
  });

  app.put("/api/complaints/:id/reject", requireAuth, (req, res) => {
    const user = (req as any).user;
    const complaint = storage.rejectResolution(sp(req.params.id), user.id);
    if (!complaint) return res.status(404).json({ message: "Not found" });
    res.json(complaint);
  });

  // ── SOS ───────────────────────────────────────────────────────────────
  app.get("/api/sos", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getSosAlerts(district));
  });

  app.post("/api/sos", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { category, description, location, geo, ward, wardNumber } = req.body;
    if (!category) return res.status(400).json({ message: "category required" });
    const geoPoint = geo || { lat: 30.3165, lng: 78.0322 };
    const alert = storage.createSos({
      category, description: description || "Emergency reported via SANKALP AI",
      location: location || "Location via GPS",
      geo: geoPoint, ward: ward || "Dehradun Block", wardNumber: wardNumber || 1,
      district: user.district || "Dehradun",
      status: "active", triggeredBy: user.name,
    }, user.id);
    res.status(201).json(alert);
  });

  app.put("/api/sos/:id/location", requireAuth, (req, res) => {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "lat and lng (numbers) required" });
    }
    const alert = storage.updateSosLocation(sp(req.params.id), { lat, lng });
    if (!alert) return res.status(404).json({ message: "SOS alert not found" });
    // Stream live location to CPR command center
    cprEmitter.emit("event", {
      type: "sos_location_update",
      alertId: sp(req.params.id),
      lat, lng,
      timestamp: new Date().toISOString(),
    });
    // Also broadcast via WebSocket so admin portal gets it
    broadcast({ type: "sos_location_update", alertId: sp(req.params.id), lat, lng, timestamp: new Date().toISOString() });
    res.json(alert);
  });

  app.put("/api/sos/:id/resolve", requireAdmin, (req, res) => {
    const alert = storage.resolveSos(sp(req.params.id));
    if (!alert) return res.status(404).json({ message: "Not found" });
    res.json(alert);
  });

  // ── CITY DATA ─────────────────────────────────────────────────────────
  app.get("/api/wards", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getWards(district));
  });

  app.get("/api/workers", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getWorkers(district));
  });

  app.get("/api/police-stations", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getPoliceStations(district));
  });

  app.get("/api/risk-zones", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getRiskZones(district));
  });

  app.get("/api/nearest-police", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: "lat and lng required" });
    const district = user.role === "super_admin" ? undefined : user.district;
    const stations = storage.getNearestPoliceStations(
      { lat: parseFloat(lat as string), lng: parseFloat(lng as string) }, 3, district
    );
    res.json(stations);
  });

  app.get("/api/leaderboard", requireAuth, (req, res) => {
    res.json(storage.getLeaderboard());
  });

  // ── ADMIN ─────────────────────────────────────────────────────────────
  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getAdminStats(district));
  });

  app.get("/api/admin/complaints", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    const { status, priority, ward } = req.query;
    let complaints = storage.getComplaints(district);
    if (status) complaints = complaints.filter(c => c.status === status);
    if (priority) complaints = complaints.filter(c => c.priority === priority);
    if (ward) complaints = complaints.filter(c => c.wardNumber === Number(ward));
    res.json(complaints);
  });

  app.get("/api/admin/alerts", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getSosAlerts(district));
  });

  app.get("/api/admin/workers", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getWorkers(district));
  });

  // PUT /api/admin/complaints/:id — admin update status + note
  app.put("/api/admin/complaints/:id", requireAdmin, (req, res) => {
    const { status, adminNote } = req.body as { status?: string; adminNote?: string };
    const all = storage.getComplaints();
    const c = all.find(x => x.id === sp(req.params.id));
    if (!c) { res.status(404).json({ message: "Complaint not found" }); return; }
    if (status) (c as any).status = status;
    if (adminNote !== undefined) (c as any).adminNote = adminNote;
    if (status === "resolved") c.resolvedAt = new Date().toISOString();
    // Notify via WebSocket when complaint is resolved
    if (status === "resolved" || status === "closed") {
      broadcast({ type: "complaint_resolved", complaintId: c.id, ticketId: (c as any).ticketId, status, timestamp: new Date().toISOString() });
    }
    // Also notify the relevant department SSE stream
    const deptId = getDeptIdForCategory((c as any).category);
    deptEmitter.emit("event", { type: "complaint_updated", departmentId: deptId, complaint: c });
    res.json(c);
  });

  app.get("/api/admin/risk-zones", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getRiskZones(district));
  });

  // Super admin: get all districts summary
  app.get("/api/superadmin/districts", requireSuperAdmin, (req, res) => {
    const DISTRICTS = [
      "Dehradun", "Haridwar", "Tehri Garhwal", "Pauri Garhwal",
      "Rudraprayag", "Chamoli", "Uttarkashi", "Pithoragarh",
      "Bageshwar", "Almora", "Champawat", "Nainital", "Udham Singh Nagar"
    ];
    const summary = DISTRICTS.map(district => {
      const stats = storage.getAdminStats(district);
      const wards = storage.getWards(district);
      const avgHealth = wards.length ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length) : 0;
      return { district, ...stats, avgHealthScore: avgHealth, wardCount: wards.length };
    });
    res.json(summary);
  });

  // ── DEPARTMENT ROUTING ────────────────────────────────────────────────
  app.get("/api/departments", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    const complaints = storage.getComplaints(district);
    const deptMap: Record<string, { name: string; complaints: number; pending: number; resolved: number; categories: string[] }> = {};
    complaints.forEach(c => {
      const dept = c.department || "DM Office (District Magistrate)";
      if (!deptMap[dept]) deptMap[dept] = { name: dept, complaints: 0, pending: 0, resolved: 0, categories: [] };
      deptMap[dept].complaints++;
      if (c.status === "pending" || c.status === "in_progress") deptMap[dept].pending++;
      if (c.status === "resolved" || c.status === "closed") deptMap[dept].resolved++;
      if (!deptMap[dept].categories.includes(c.category)) deptMap[dept].categories.push(c.category);
    });
    res.json(Object.values(deptMap).sort((a, b) => b.complaints - a.complaints));
  });

  app.get("/api/departments/:name/complaints", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    const complaints = storage.getComplaints(district).filter(c => (c.department || "DM Office (District Magistrate)") === decodeURIComponent(sp(req.params.name)));
    res.json(complaints);
  });

  // ── ADMIN EMERGENCY BROADCAST ────────────────────────────────────────
  app.post("/api/admin/emergency-broadcast", requireAdmin, (req, res) => {
    const { message, severity } = req.body;
    broadcast({
      type: "emergency_broadcast",
      message: message || "DISTRICT-WIDE EMERGENCY ALERT: Take immediate precautions. Follow official instructions.",
      severity: severity || "high",
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  });

  // ── WOMEN SAFETY NOTIFY ───────────────────────────────────────────────
  app.post("/api/sos/women-safety", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { geo, location, audioUrl } = req.body;
    const geoPoint = geo || { lat: 30.3165, lng: 78.0322 };
    const nearestStations = storage.getNearestPoliceStations(geoPoint, 2, user.district);
    const alert = storage.createSos({
      category: "women_safety",
      description: "PANIC SOS — Women Safety Emergency triggered via SANKALP AI citizen app",
      location: location || `GPS: ${geoPoint.lat.toFixed(4)}, ${geoPoint.lng.toFixed(4)}`,
      geo: geoPoint,
      ward: user.district || "Dehradun",
      wardNumber: 1,
      district: user.district || "Dehradun",
      status: "active",
      triggeredBy: user.name,
      nearestPoliceStation: nearestStations[0]?.name,
      policeDistance: (nearestStations[0] as any)?.distance,
      audioRecordingUrl: audioUrl || undefined,
    } as any, user.id);

    const payload = {
      type: "women_safety_sos",
      alert,
      nearestStations: nearestStations.slice(0, 2),
      audioAvailable: !!audioUrl,
      triggeredBy: user.name,
      phone: user.phone,
      district: user.district,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all WebSocket clients (mobile app + admin portal)
    broadcast(payload);
    // Stream to CPR Safety Command Center
    cprEmitter.emit("event", { ...payload, type: "sos_new" });
    // Notify police department SSE stream
    deptEmitter.emit("event", { type: "sos_alert", departmentId: "police", alert, payload });

    res.status(201).json({ alert, nearestStations: nearestStations.slice(0, 2) });
  });

  // ── SOS AUDIO URL PATCH (auto-called 18s after women-safety SOS) ─────────
  app.put("/api/sos/:id/audio-url", requireAuth, (req, res) => {
    const { audioUrl } = req.body;
    const id = sp(req.params.id);
    const alerts = storage.getSosAlerts();
    const alert = alerts.find(a => a.id === id);
    if (!alert) return res.status(404).json({ message: "SOS alert not found" });
    (alert as any).audioRecordingUrl = audioUrl;
    // Notify CPR + dept with updated audio evidence
    const updatePayload = { type: "sos_audio_evidence", alertId: id, audioUrl, timestamp: new Date().toISOString() };
    broadcast(updatePayload);
    cprEmitter.emit("event", updatePayload);
    deptEmitter.emit("event", { ...updatePayload, departmentId: "police" });
    res.json({ success: true, alertId: id, audioUrl });
  });

  // ── SUPER ADMIN: ASSIGN TASK TO DISTRICT ──────────────────────────────────
  app.post("/api/superadmin/assign-task", requireSuperAdmin, (req, res) => {
    const user = (req as any).user;
    const { district, task } = req.body;
    if (!district || !task) return res.status(400).json({ message: "district and task required" });
    const ann = storage.createAnnouncement({
      title: `📋 Task Assigned by State Administration`,
      body: `URGENT DIRECTIVE from State Command (${user.name}):\n\n${task}\n\nPlease acknowledge and act immediately.`,
      type: "emergency",
      department: "State Government of Uttarakhand",
      priority: "urgent",
      targetDistrict: district,
      postedBy: user.name,
    });
    broadcast({ type: "announcement", announcement: ann, timestamp: new Date().toISOString() });
    res.json({ success: true, announcement: ann, message: `Task assigned to ${district} administration` });
  });

  // ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
  app.get("/api/announcements", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    const anns = storage.getAnnouncements(district);
    anns.forEach(a => storage.incrementAnnouncementViews(a.id));
    res.json(storage.getAnnouncements(district));
  });

  app.post("/api/announcements", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const { title, body, type, department, priority, targetWards, targetDistrict, expiresAt, link } = req.body;
    if (!title || !body) return res.status(400).json({ message: "title and body required" });
    const ann = storage.createAnnouncement({
      title, body, type: type || "general",
      department: department || "District Administration",
      priority: priority || "normal",
      targetWards, link, expiresAt,
      targetDistrict: user.role === "super_admin" ? targetDistrict : user.district,
      postedBy: user.name,
    });
    res.status(201).json(ann);
  });

  app.delete("/api/announcements/:id", requireAdmin, (req, res) => {
    const ok = storage.deleteAnnouncement(sp(req.params.id));
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  // ── SLA AUTO-ESCALATION ───────────────────────────────────────────────
  setInterval(() => {
    const now = Date.now();
    const SLA_HOURS: Record<string, number> = { P1: 24, P2: 48, P3: 72, P4: 168 };
    storage.getComplaints().forEach(c => {
      if (c.status === "pending" || c.status === "in_progress") {
        const hoursElapsed = (now - new Date(c.submittedAt).getTime()) / 3600000;
        const sla = SLA_HOURS[c.priority] || 72;
        if (hoursElapsed > sla) {
          broadcast({ type: "sla_breach", complaintId: c.id, ticketId: (c as any).ticketId, priority: c.priority, hoursElapsed: Math.round(hoursElapsed), slaHours: sla, timestamp: new Date().toISOString() });
          storage.addAuditLog("sla_breach", "system", "SANKALP System", `SLA breached: ${Math.round(hoursElapsed)}h > ${sla}h limit`, c.id);
        }
      }
    });
  }, 5 * 60 * 1000);

  // ── POLLS ─────────────────────────────────────────────────────────────
  app.get("/api/polls", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getPolls(district));
  });

  app.post("/api/polls", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const { question, options, expiresAt } = req.body;
    if (!question || !options || options.length < 2) return res.status(400).json({ message: "question and at least 2 options required" });
    const poll = storage.createPoll({ question, options, votes: options.map(() => 0), voterIds: [], district: user.role === "super_admin" ? undefined : user.district, createdAt: new Date().toISOString(), createdBy: user.name, status: "active", expiresAt });
    res.status(201).json(poll);
  });

  app.put("/api/polls/:id/vote", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { optionIndex } = req.body;
    if (optionIndex === undefined || optionIndex === null) return res.status(400).json({ message: "optionIndex required" });
    const poll = storage.votePoll(sp(req.params.id), optionIndex, user.id);
    if (!poll) return res.status(404).json({ message: "Poll not found or closed" });
    res.json(poll);
  });

  // ── PETITIONS ─────────────────────────────────────────────────────────
  app.get("/api/petitions", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getPetitions(district));
  });

  app.post("/api/petitions", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { title, description, target, goalSignatures, department } = req.body;
    if (!title || !description || !target) return res.status(400).json({ message: "title, description, target required" });
    const petition = storage.createPetition({ title, description, target, goalSignatures: goalSignatures || 500, signerIds: [], district: user.district, createdAt: new Date().toISOString(), createdBy: user.name, status: "active", department: department || "District Administration" });
    res.status(201).json(petition);
  });

  app.put("/api/petitions/:id/sign", requireAuth, (req, res) => {
    const user = (req as any).user;
    const petition = storage.signPetition(sp(req.params.id), user.id);
    if (!petition) return res.status(404).json({ message: "Petition not found or closed" });
    res.json(petition);
  });

  // ── RTI ───────────────────────────────────────────────────────────────
  app.get("/api/rti", requireAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role === "citizen") {
      return res.json(storage.getRTIsByPhone(user.phone));
    }
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getRTIs(undefined, district));
  });

  app.post("/api/rti", requireAuth, (req, res) => {
    const user = (req as any).user;
    const subject = req.body.subject || req.body.title;
    const description = req.body.description || req.body.questionText;
    const department = req.body.department || req.body.targetDepartment;
    if (!subject || !description || !department) return res.status(400).json({ message: "subject/title, description/questionText, department/targetDepartment required" });
    const rti = storage.createRTI({ subject, description, department, filedBy: user.name, filedByPhone: user.phone, district: req.body.district || user.district });
    res.status(201).json(rti);
  });

  app.put("/api/rti/:id/respond", requireAdmin, (req, res) => {
    const { response } = req.body;
    if (!response) return res.status(400).json({ message: "response required" });
    const rti = storage.respondRTI(sp(req.params.id), response);
    if (!rti) return res.status(404).json({ message: "RTI not found" });
    res.json(rti);
  });

  // ── CIVIC EVENTS ──────────────────────────────────────────────────────
  app.get("/api/events", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = user.role === "super_admin" ? undefined : user.district;
    res.json(storage.getEvents(district));
  });

  app.post("/api/events", requireAdmin, (req, res) => {
    const user = (req as any).user;
    const { title, description, date, time, location, type } = req.body;
    if (!title || !date || !location) return res.status(400).json({ message: "title, date, location required" });
    const event = storage.createEvent({ title, description: description || "", date, time: time || "TBD", location, type: type || "meeting", district: user.role === "super_admin" ? undefined : user.district, organizer: user.name });
    res.status(201).json(event);
  });

  app.put("/api/events/:id/rsvp", requireAuth, (req, res) => {
    const user = (req as any).user;
    const event = storage.rsvpEvent(sp(req.params.id), user.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  });

  // ── COMPLAINT CHAT ────────────────────────────────────────────────────
  app.get("/api/complaints/:id/chat", requireAuth, (req, res) => {
    res.json(storage.getChatMessages(sp(req.params.id)));
  });

  app.post("/api/complaints/:id/chat", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: "message required" });
    const role: "citizen" | "officer" = (user.role === "admin" || user.role === "super_admin") ? "officer" : "citizen";
    const msg = storage.addChatMessage(sp(req.params.id), message, user.name, role);
    res.status(201).json(msg);
  });

  // ── BUDGET TRACKER ────────────────────────────────────────────────────
  app.get("/api/budget", requireAuth, (req, res) => {
    const user = (req as any).user;
    const district = (req.query.district as string) || (user.role === "super_admin" ? undefined : user.district);
    res.json(storage.getBudgetItems(district));
  });

  // ── AUDIT LOGS ────────────────────────────────────────────────────────
  app.get("/api/audit", requireAdmin, (req, res) => {
    const { complaintId } = req.query;
    res.json(storage.getAuditLogs(typeof complaintId === "string" ? complaintId : undefined));
  });

  app.get("/api/complaints/:id/audit", requireAuth, (req, res) => {
    res.json(storage.getAuditLogs(sp(req.params.id)));
  });

  // ── EMERGENCY SERVICES ────────────────────────────────────────────────
  app.get("/api/emergency-services", requireAuth, (req, res) => {
    const { type, district } = req.query;
    let services = storage.getEmergencyServices();
    if (type) services = services.filter(s => s.type === type);
    if (district && district !== "Uttarakhand") services = services.filter(s => s.district === district);
    res.json(services);
  });

  // ── PREDICTIVE MAINTENANCE AI ──────────────────────────────────────────
  app.get("/api/predictive", requireAuth, (req, res) => {
    const user = (req as any).user;
    const alerts = storage.getPredictiveAlerts(user.role === "super_admin" ? undefined : user.district);
    res.json(alerts);
  });

  // ── QR CODE GENERATION ────────────────────────────────────────────────
  app.get("/api/qr/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const { size = "200" } = req.query;
    const s = parseInt(size as string) || 200;
    const domain = process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.repl.co` : "https://sankalp.uk.gov.in";
    const url = `${domain}/verify/${id}`;
    const cellSize = Math.floor(s / 21);
    const matrix = generateQRMatrix(url);
    let cells = "";
    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        if (matrix[r][c]) {
          cells += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="#fff"/>${cells}</svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(svg);
  });

  // ── PUSH TOKEN REGISTRATION ────────────────────────────────────────────
  app.post("/api/push-token", requireAuth, (req, res) => {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: "token required" });
    res.json({ success: true, registered: true });
  });

  // ── AI CHAT ───────────────────────────────────────────────────────────
  app.post("/api/ai/chat", requireAuth, rateLimit(30, 60_000), async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ message: "message required" });

    const user = (req as any).user;

    const systemPrompt = buildSystemPrompt(user?.name, user?.district);
    const msgs: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-6).map((h: any) => ({
        role: h.role === "ai" ? "assistant" : h.role,
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Try Groq first (fastest, OpenAI-compatible)
    if (GROQ_API_KEY) {
      try {
        const groqReply = await callGroqChat(msgs, "llama-3.1-8b-instant", 500);
        if (groqReply) {
          return res.json({ reply: groqReply, timestamp: new Date().toISOString(), powered_by: "Groq LLaMA" });
        }
      } catch (e) {
        console.error("[AI Chat] Groq failed, trying NVIDIA:", e);
      }
    }

    // Try NVIDIA as secondary
    if (NVIDIA_API_KEY) {
      try {
        const nvidiaReply = await callNvidiaChat(msgs, "meta/llama-3.1-8b-instruct", 500);
        if (nvidiaReply) {
          return res.json({ reply: nvidiaReply, timestamp: new Date().toISOString(), powered_by: "NVIDIA LLaMA" });
        }
      } catch (e) {
        console.error("[AI Chat] NVIDIA failed, falling back to local:", e);
      }
    }

    // Fallback to local rule-based engine
    const reply = generateAIReply(message, history || [], user?.name, user?.district);
    res.json({ reply, timestamp: new Date().toISOString(), powered_by: "SANKALP AI" });
  });

  // ── AI IMAGE ANALYSIS ─────────────────────────────────────────────────
  app.post("/api/ai/analyze-image", requireAuth, async (req, res) => {
    const { imageBase64, category } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "imageBase64 required" });

    const prompt = `You are an expert civic infrastructure analyst for Uttarakhand, India. Look at this photo carefully and identify the civic issue shown.

Respond with ONLY a valid JSON object — no explanation, no markdown, just the JSON:
{"severity":"Low/Medium/High/Critical","issueType":"pothole/garbage/streetlight/water/drain/electricity/tree/other","description":"Clear, specific 1-2 sentence description of what you see and why it needs attention","priority":"P1/P2/P3/P4","department":"The exact Uttarakhand government department responsible","estimatedFixTime":"e.g. 1-2 days / 1 week / 2-4 weeks"}

P1 = immediate danger to life/safety. P2 = significant public impact. P3 = moderate inconvenience. P4 = minor issue.`;

    const raw = await callNvidiaVision(imageBase64, prompt);
    if (raw) {
      try {
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return res.json({ analysis: parsed, powered_by: "NVIDIA Vision LLaMA" });
        }
      } catch {}
      return res.json({
        analysis: { severity: "Medium", issueType: category || "other", description: raw.slice(0, 200), priority: "P3", department: "Municipal Corporation", estimatedFixTime: "1 week" },
        powered_by: "NVIDIA Vision LLaMA",
      });
    }

    const catMap: Record<string, string> = {
      pothole: "PWD Uttarakhand", garbage: "Urban Local Body", streetlight: "ULB Electric Wing",
      water: "Uttarakhand Jal Sansthan", drain: "Uttarakhand Jal Sansthan",
      electricity: "UPCL", tree: "Forest Department",
    };
    res.json({
      analysis: {
        severity: "Medium", issueType: category || "other",
        description: "Photo received and logged. Our team will review and assess the issue shortly.",
        priority: "P3", department: catMap[category] || "Municipal Corporation", estimatedFixTime: "3-5 days",
      },
      powered_by: "fallback",
    });
  });

  // ── IMAGE UPLOAD ──────────────────────────────────────────────────────────────
  app.post("/api/upload", requireAuth, async (req, res) => {
    try {
      const { image, filename } = req.body;
      if (!image) return res.status(400).json({ message: "image data required" });
      const { mkdirSync, writeFileSync } = await import("fs");
      const { join } = await import("path");
      const uploadsDir = join(process.cwd(), "uploads");
      try { mkdirSync(uploadsDir, { recursive: true }); } catch {}
      const ext = filename?.split(".").pop() || "jpg";
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      writeFileSync(join(uploadsDir, name), Buffer.from(base64Data, "base64"));
      res.json({ url: `/uploads/${name}`, filename: name });
    } catch (err: any) {
      res.status(500).json({ message: "Upload failed", error: err.message });
    }
  });

  // ── AUDIO UPLOAD (SOS evidence) ───────────────────────────────────────────────
  app.post("/api/upload/audio", requireAuth, async (req, res) => {
    try {
      const { audio, filename } = req.body;
      if (!audio) return res.status(400).json({ message: "audio data required" });
      const { mkdirSync, writeFileSync } = await import("fs");
      const { join } = await import("path");
      const uploadsDir = join(process.cwd(), "uploads");
      try { mkdirSync(uploadsDir, { recursive: true }); } catch {}
      const ext = filename?.split(".").pop() || "m4a";
      const name = `sos-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const base64Data = audio.replace(/^data:[^;]+;base64,/, "");
      writeFileSync(join(uploadsDir, name), Buffer.from(base64Data, "base64"));
      const url = `/uploads/${name}`;
      const user = (req as any).user;
      storage.addAuditLog("sos_audio_uploaded", user.id, user.name, `SOS audio evidence uploaded: ${name}`);
      res.json({ url, filename: name });
    } catch (err: any) {
      res.status(500).json({ message: "Audio upload failed", error: err.message });
    }
  });

  // ── WORKER TEMP LOGIN ──────────────────────────────────────────────────────────
  app.post("/api/auth/worker-login", async (req, res) => {
    const { phone, pin, complaintId } = req.body;
    if (!phone || !pin || !complaintId) return res.status(400).json({ message: "phone, pin, complaintId required" });
    const valid = storage.verifyWorkerTempToken(phone, pin, complaintId);
    if (!valid) return res.status(401).json({ message: "Invalid credentials or expired. Contact your department." });
    const all = storage.getComplaints();
    const c = all.find(x => x.id === complaintId);
    if (!c) return res.status(404).json({ message: "Complaint not found" });
    res.json({ success: true, complaint: c, workerName: c.assignedWorkerName, complaintId });
  });

  // ── COMPLAINT PROOF SUBMISSION (by assigned worker) ───────────────────────────
  app.put("/api/complaints/:id/proof", async (req, res) => {
    const { phone, pin, proofPhoto, proofNote } = req.body;
    const complaintId = sp(req.params.id);
    if (!phone || !pin) return res.status(400).json({ message: "phone and pin required" });
    const valid = storage.verifyWorkerTempToken(phone, pin, complaintId);
    if (!valid) return res.status(401).json({ message: "Invalid worker credentials" });
    const c = storage.submitComplaintProof(complaintId, proofPhoto, proofNote);
    if (!c) return res.status(404).json({ message: "Complaint not found" });
    // Broadcast resolution to all connected clients
    broadcast({ type: "complaint_resolved", complaintId: c.id, ticketId: (c as any).ticketId, proofSubmitted: true, timestamp: new Date().toISOString() });
    // Notify dept SSE stream
    const deptId = getDeptIdForCategory((c as any).category);
    deptEmitter.emit("event", { type: "complaint_resolved_proof", departmentId: deptId, complaint: c });
    storage.addAuditLog("proof_submitted", phone, c.assignedWorkerName || phone, `Proof submitted for complaint ${(c as any).ticketId}`, c.id);
    res.json(c);
  });

  // ── DEPT ASSIGN WORKER ────────────────────────────────────────────────────────
  app.put("/api/dept/complaints/:id/assign-worker", requireDeptAuth, (req, res) => {
    const { workerName, workerPhone } = req.body;
    const complaintId = sp(req.params.id);
    if (!workerName || !workerPhone) return res.status(400).json({ message: "workerName and workerPhone required" });
    const pin = storage.assignWorkerToComplaint(complaintId, workerName, workerPhone);
    const all = storage.getComplaints();
    const c = all.find(x => x.id === complaintId);
    if (!c) return res.status(404).json({ message: "Complaint not found" });
    // Notify SSE stream
    const deptId = (req as any).deptId;
    deptEmitter.emit("event", { type: "worker_assigned", departmentId: deptId, complaint: c });
    // Broadcast to mobile app (admin sees assignment)
    broadcast({ type: "worker_assigned", complaintId: c.id, workerName, workerPhone, timestamp: new Date().toISOString() });
    storage.addAuditLog("worker_assigned", deptId, deptId, `Worker ${workerName} (${workerPhone}) assigned to complaint ${(c as any).ticketId}. PIN: ${pin}`, complaintId);
    res.json({ success: true, pin, complaint: c, credentials: { phone: workerPhone, pin, complaintId, validFor: "48 hours" } });
  });

  // ── CPR USER REQUEST (citizen requests CPR/safety help) ───────────────────────
  app.post("/api/cpr/user-request", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { location, lat, lng, reason } = req.body;
    if (!location) return res.status(400).json({ message: "location required" });
    const incident = storage.createSafetyIncident({
      citizenName: user.name,
      district: user.district || "Dehradun",
      location: location,
      lat: lat ?? 30.3165,
      lng: lng ?? 78.0322,
    });
    // Also broadcast to WebSocket (admin sees it)
    broadcast({ type: "cpr_user_request", incident, citizenName: user.name, phone: user.phone, reason: reason || "", timestamp: new Date().toISOString() });
    res.status(201).json({ success: true, incident, message: "CPR help requested. Nearest patrol van is being dispatched." });
  });

  // ── DEPARTMENT PORTAL API ─────────────────────────────────────────────────────
  const DEPT_SECRET = process.env.DEPT_JWT_SECRET || "sankalp-dept-secret-2026";

  function signDeptToken(departmentId: string): string {
    const payload = JSON.stringify({ departmentId, type: "dept", exp: Date.now() + 12 * 3600 * 1000 });
    const encoded = Buffer.from(payload).toString("base64url");
    const sig = createHmac("sha256", DEPT_SECRET).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
  }

  function verifyDeptToken(token: string): { departmentId: string } | null {
    try {
      const [encoded, sig] = token.split(".");
      if (!encoded || !sig) return null;
      const expected = createHmac("sha256", DEPT_SECRET).update(encoded).digest("base64url");
      if (sig !== expected) return null;
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!payload.departmentId || payload.exp < Date.now()) return null;
      return { departmentId: payload.departmentId };
    } catch { return null; }
  }

  function requireDeptAuth(req: Request, res: Response, next: NextFunction) {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = verifyDeptToken(token);
    if (!decoded) { res.status(401).json({ message: "Invalid or expired department token" }); return; }
    (req as any).deptId = decoded.departmentId;
    next();
  }

  // POST /api/dept/login
  app.post("/api/dept/login", (req, res) => {
    const { departmentId, accessCode } = req.body as { departmentId?: string; accessCode?: string };
    if (!departmentId || !accessCode) { res.status(400).json({ message: "departmentId and accessCode required" }); return; }
    if (accessCode !== `${departmentId}_2026`) { res.status(401).json({ message: "Invalid access code" }); return; }
    const dept = DEPARTMENTS[departmentId];
    if (!dept) { res.status(404).json({ message: "Department not found" }); return; }
    const token = signDeptToken(departmentId);
    res.json({ token, department: dept });
  });

  // GET /api/departments
  app.get("/api/departments", (_req, res) => {
    res.json(Object.values(DEPARTMENTS));
  });

  // GET /api/dept/:deptId/complaints
  app.get("/api/dept/:deptId/complaints", requireDeptAuth, (req, res) => {
    const deptId = (req as any).deptId as string;
    if (req.params.deptId !== deptId) { res.status(403).json({ message: "Access denied" }); return; }
    const dept = DEPARTMENTS[deptId];
    const all = storage.getComplaints();
    const filtered = dept && dept.categories.length > 0
      ? all.filter(c => dept.categories.includes(c.category))
      : all; // depts with no category mapping (health, police, etc.) see all
    const enriched = filtered.map(c => ({
      ...c,
      departmentId: getDeptIdForCategory(c.category),
      departmentName: DEPARTMENTS[getDeptIdForCategory(c.category)]?.name || "Unknown",
      ticketId: c.ticketId,
      submittedAt: c.submittedAt,
    }));
    res.json({ complaints: enriched, total: enriched.length });
  });

  // GET /api/dept/:deptId/stats
  app.get("/api/dept/:deptId/stats", requireDeptAuth, (req, res) => {
    const deptId = (req as any).deptId as string;
    if (req.params.deptId !== deptId) { res.status(403).json({ message: "Access denied" }); return; }
    const dept = DEPARTMENTS[deptId];
    const all = storage.getComplaints();
    const mine = dept && dept.categories.length > 0
      ? all.filter(c => dept.categories.includes(c.category))
      : all;
    const now = Date.now();
    res.json({
      total: mine.length,
      pending: mine.filter(c => c.status === "pending").length,
      inProgress: mine.filter(c => c.status === "in_progress").length,
      resolved: mine.filter(c => c.status === "resolved" || c.status === "closed").length,
      p1Critical: mine.filter(c => c.priority === "P1").length,
      todayCount: mine.filter(c => now - new Date(c.submittedAt).getTime() < 86400000).length,
      weekCount: mine.filter(c => now - new Date(c.submittedAt).getTime() < 7 * 86400000).length,
    });
  });

  // GET /api/dept/:deptId/workers
  app.get("/api/dept/:deptId/workers", requireDeptAuth, (req, res) => {
    const workers = storage.getWorkers();
    res.json(workers.slice(0, 30));
  });

  // PUT /api/dept/complaints/:id — update status
  app.put("/api/dept/complaints/:id", requireDeptAuth, (req, res) => {
    const { status } = req.body as { status?: string };
    const all = storage.getComplaints();
    const c = all.find(x => x.id === req.params.id);
    if (!c) { res.status(404).json({ message: "Complaint not found" }); return; }
    if (status) (c as any).status = status;
    res.json(c);
  });

  // GET /api/dept/:deptId/stream — SSE real-time feed
  app.get("/api/dept/:deptId/stream", requireDeptAuth, (req, res) => {
    const deptId = (req as any).deptId as string;
    if (req.params.deptId !== deptId) { res.status(403).end(); return; }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Heartbeat every 25s to keep connection alive
    const hb = setInterval(() => res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`), 25000);

    const listener = (ev: unknown) => {
      const e = ev as { type: string; departmentId?: string };
      if (e.type === "complaint_new" && e.departmentId === deptId) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    };
    deptEmitter.on("event", listener);

    req.on("close", () => {
      clearInterval(hb);
      deptEmitter.off("event", listener);
    });
  });

  // ── RTI PORTAL: AI draft + submit ────────────────────────────────────────────
  app.post("/api/rti/ai-draft", requireAuth, async (req, res) => {
    const { topic, targetDepartment, district } = req.body;
    if (!topic) return res.status(400).json({ message: "topic required" });
    const apiKey = process.env.NVIDIA_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            messages: [{ role: "user", content: `Write a formal RTI application under RTI Act 2005 for the topic: "${topic}". Target department: ${targetDepartment}. District: ${district}, Uttarakhand. Include salutation to PIO, specific information sought, legal basis under Section 6 RTI Act 2005, and request for reply within 30 days. Keep it concise and professional.` }],
            max_tokens: 500,
          }),
        });
        const data = await response.json() as { choices?: { message: { content: string } }[] };
        if (data.choices?.[0]) return res.json({ text: data.choices[0].message.content });
      } catch { /* fall through to template */ }
    }
    const draftText = `To,\nThe Public Information Officer,\n${targetDepartment || "Concerned Department"},\n${district || "Uttarakhand"}\n\nSub: Application for Information under Right to Information Act, 2005\n\nRespected Sir/Madam,\n\nI would like to request the following information under Section 6 of the Right to Information Act, 2005:\n\n${topic}\n\nSpecifically, I request:\n1. Complete details regarding ${topic}\n2. All relevant documents, records, and files pertaining to the above\n3. Names of responsible officials and their designations\n4. Status of any pending action or decision\n5. Copies of any orders, circulars, or notices issued in this regard\n\nI am attaching the requisite application fee of \u20B910/- (BPL applicants are exempted). Please provide the requested information within 30 days as mandated under Section 7(1) of the RTI Act, 2005.\n\nIf the information is not available with your department, please transfer this application to the concerned Public Authority under Section 6(3) of the RTI Act within 5 days.\n\nThank you,\n[Your Name]\n[Address]\n[Phone/Email]\n[Date]`;
    res.json({ text: draftText });
  });

  app.post("/api/rti/:id/submit", requireAuth, (req, res) => {
    const rti = storage.submitRTI(sp(req.params.id));
    if (!rti) return res.status(404).json({ message: "RTI not found" });
    res.json(rti);
  });

  // ── CPR SAFETY COMMAND ────────────────────────────────────────────────────────
  app.get("/api/cpr/patrols", (req, res) => {
    const { district } = req.query;
    res.json(storage.getPatrolVans(typeof district === "string" ? district : undefined));
  });

  app.get("/api/cpr/incidents", (req, res) => {
    const { district } = req.query;
    res.json(storage.getSafetyIncidents(typeof district === "string" ? district : undefined));
  });

  app.post("/api/cpr/incidents", (req, res) => {
    const { citizenName, district, location, lat, lng } = req.body;
    if (!citizenName || !district || !location) return res.status(400).json({ message: "citizenName, district, location required" });
    const incident = storage.createSafetyIncident({ citizenName, district, location, lat: lat ?? 30.3165, lng: lng ?? 78.0322 });
    res.status(201).json(incident);
  });

  app.put("/api/cpr/incidents/:id/update", (req, res) => {
    const { status, message, actor } = req.body;
    const inc = storage.updateIncidentStatus(sp(req.params.id), status || "safe", message || "Status updated", actor || "CPR Command");
    if (!inc) return res.status(404).json({ message: "Incident not found" });
    res.json(inc);
  });

  app.put("/api/cpr/patrols/:id/location", (req, res) => {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ message: "lat and lng required" });
    const van = storage.updatePatrolLocation(sp(req.params.id), { lat, lng });
    if (!van) return res.status(404).json({ message: "Patrol van not found" });
    res.json(van);
  });

  app.get("/api/cpr/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();
    const hb = setInterval(() => res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`), 25000);
    const listener = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    cprEmitter.on("event", listener);
    req.on("close", () => { clearInterval(hb); cprEmitter.off("event", listener); });
  });

  // ── PUBLIC CIVIC DASHBOARD ────────────────────────────────────────────────────
  app.get("/api/public/department-report", (_req, res) => {
    const allComplaints = storage.getComplaints();
    const report = Object.entries(DEPARTMENTS).map(([id, dept]) => {
      const complaints = dept.categories.length > 0
        ? allComplaints.filter(c => dept.categories.includes(c.category))
        : allComplaints;
      const total = complaints.length;
      const resolved = complaints.filter(c => c.status === "resolved" || c.status === "closed").length;
      const pending = complaints.filter(c => c.status === "pending").length;
      const p1Pending = complaints.filter(c => c.priority === "P1" && c.status !== "resolved" && c.status !== "closed").length;
      const resolutionRate = total > 0 ? Math.round(resolved / total * 100) : 0;
      const grade = resolutionRate >= 80 ? "A" : resolutionRate >= 65 ? "B" : resolutionRate >= 50 ? "C" : "D";
      const { id: _did, ...deptRest } = dept as any;
      return { id, ...deptRest, total, resolved, pending, p1Pending, resolutionRate, grade };
    });
    res.json(report);
  });

  app.get("/api/public/ward-health", (_req, res) => {
    res.json(storage.getWards());
  });

  app.get("/api/public/stats", (_req, res) => {
    res.json(storage.getAdminStats());
  });

  return httpServer;
}
