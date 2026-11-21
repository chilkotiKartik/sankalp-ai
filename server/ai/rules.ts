/**
 * Deterministic rules engine — always available, never leaves the server.
 * Used when no Indian AI provider is configured, or when one fails (rule 1).
 */
export interface ChatTurn { role: string; content: string }
export interface LiveStats { total: number; resolved: number; pending: number; activeSos: number; avgHealth: number }

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/pothole|road damage|गड्ढा|broken road|सड़क/i, "pothole"],
  [/garbage|waste|trash|कूड़ा|कचरा|littering/i, "garbage"],
  [/streetlight|street light|lamp|अंधेरा|बत्ती/i, "streetlight"],
  [/water|पानी|pipeline|jal|leak/i, "water"],
  [/drain|sewer|sewage|overflow|नाली/i, "drain"],
  [/electricity|power cut|बिजली|transformer|voltage|wire/i, "electricity"],
  [/tree|पेड़|branch/i, "tree"],
  [/landslide|flood|भूस्खलन|बाढ़|cloudburst/i, "disaster"],
  [/noise|loudspeaker|शोर/i, "noise"],
];

/** Rule-based category guess with an explicit, honest confidence and reason. */
export function classifyText(text: string): { category: string; confidence: number; reason: string; method: "rules" } {
  for (const [re, cat] of CATEGORY_RULES) {
    const m = text.match(re);
    if (m) return { category: cat, confidence: 0.6, reason: `keyword "${m[0]}" matched`, method: "rules" };
  }
  return { category: "other", confidence: 0.2, reason: "no keyword matched — needs officer review", method: "rules" };
}

export function rulesReply(message: string, history: ChatTurn[] = [], userName?: string, userDistrict?: string, stats?: LiveStats): string {
  const msg = message.toLowerCase().trim();
  const firstName = userName ? userName.split(" ")[0] : "";
  const name = firstName ? `, ${firstName}` : "";
  const district = userDistrict || "Uttarakhand";
  // Check if user has mentioned a specific topic in the last turn for context
  void history; const _lastBotMsg = history.filter(h => h.role === "ai" || h.role === "assistant").pop()?.content?.toLowerCase() || "";

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
    if (!stats || stats.total === 0) {
      return `I don't have enough recorded complaints for ${district} yet to give meaningful numbers${name}. The Analytics tab shows live figures as soon as reports come in.`;
    }
    const { total: complaintsLen, resolved, pending, activeSos, avgHealth } = stats;
    return `Here's the live picture for ${district} right now${name}:\n\n${complaintsLen} total complaints have been filed — ${resolved} resolved (${Math.round(resolved/Math.max(complaintsLen,1)*100)}% resolution rate), and ${pending} still pending. There ${activeSos === 1 ? "is 1 active SOS alert" : `are ${activeSos} active SOS alerts`} being responded to.\n\nThe average district health score is ${avgHealth}/100. You can see the full breakdown in the Analytics tab — it updates in real time.\n\nWant me to explain what any of these numbers mean?`;
  }

  const fallbacks = [
    `Good question${name}! I want to make sure I give you the most useful answer.\n\nI specialise in civic services for ${district} — complaint filing, status tracking, emergency helplines, government schemes, and women safety. Could you tell me a bit more about what you need? I'm listening.`,
    `I hear you${name}. Let me help you find the right answer.\n\nFor anything civic in ${district} — potholes, water, power, safety — I can guide you step by step. For government schemes or emergency helplines, just ask. What's the issue you're facing?`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}
