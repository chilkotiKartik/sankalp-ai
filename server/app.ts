import { compiledPortal } from "./lib/portal-compile";
import compression from "compression";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { resolveTenantFromRequest, runInTenant, tenant } from "./tenancy";
import { errorHandler, AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import { dirs } from "./lib/media";
import { registry } from "./lib/route";
import { attachRealtime } from "./realtime";
import { registerAuthRoutes } from "./routes/auth";
import { registerComplaintRoutes } from "./routes/complaints";
import { registerSosRoutes } from "./routes/sos";
import { registerMediaRoutes } from "./routes/media";
import { registerCprRoutes } from "./routes/cpr";
import { registerDeptRoutes } from "./routes/dept";
import { registerAdminRoutes } from "./routes/admin";
import { registerAiRoutes } from "./routes/ai";
import { registerPublicRoutes } from "./routes/public";
import { registerCitizenRoutes } from "./routes/citizen";
import { registerPrivacyRoutes } from "./routes/privacy";
import { registerVerificationRoutes } from "./routes/verification";
import { registerAgentRoutes } from "./routes/agents";
import { registerChannelRoutes } from "./routes/channels";
import { registerSafetyRoutes, registerCheckInRoutes } from "./routes/safety";
import { registerDisasterRoutes } from "./routes/disaster";
import { registerYatraRoutes } from "./routes/yatra";
import { registerTransparencyRoutes } from "./routes/transparency";

const ROOT = process.cwd();
/** Body size: 100 KB by default; media-carrying routes get 22 MB (≈15 MB binary after base64). */
const LARGE_BODY = /^\/api\/(upload(\/audio)?|ai\/(analyze|detect)-image|ai\/transcribe|channels\/ivr\/recording|complaints(\/[^/]+\/proof)?|admin\/complaints\/[^/]+|dept\/complaints\/[^/]+)$/;

/** M11: only font/icon files from these packages may be served from node_modules (the web bundle references them). */
const NODE_MODULE_ASSETS = /^\/(@expo-google-fonts\/inter\/[\w/]+\.ttf|@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/[\w-]+\.ttf|@react-navigation\/elements\/lib\/[\w/]+\/assets\/[\w-]+(@\dx)?\.png|expo-router\/assets\/[\w-]+(@\dx)?\.png)$/;

function setupCors(app: Express) {
  const c = config();
  const allowed = new Set(c.CORS_ORIGINS);
  if (c.PUBLIC_BASE_URL) allowed.add(new URL(c.PUBLIC_BASE_URL).origin);
  app.use((req, res, next) => {
    const origin = req.header("origin");
    const devLocal = c.NODE_ENV !== "production" && !!origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    // Requests without Origin (native apps, curl) need no CORS headers at all (audit M12).
    if (origin && (allowed.has(origin) || devLocal)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") return res.sendStatus(origin && (allowed.has(origin) || devLocal) ? 204 : 403);
    next();
  });
}

function setupSecurityHeaders(app: Express) {
  const tile = config().mapTileUrl?.replace(/^wms:/, "");
  const tileOrigins = tile ? [tile.replace(/\{s\}\./, "").match(/^https?:\/\/[^/]+/)?.[0] ?? ""].filter(Boolean) : [];
  if (tile?.includes("{s}.")) for (const s of ["a", "b", "c"]) tileOrigins.push(tile.replace("{s}", s).match(/^https?:\/\/[^/]+/)![0]);
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // Portals compile JSX in the browser with the vendored Babel standalone (needs eval) until Phase 1 pre-builds them.
        "script-src": ["'self'", "'unsafe-inline'"], // review P5: no eval needed since portals are compiled on the server
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", ...tileOrigins],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "font-src": ["'self'", "data:"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "upgrade-insecure-requests": config().NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }));
}

function setupBody(app: Express) {
  const small = express.json({ limit: "100kb" });
  const large = express.json({ limit: "22mb" });
  app.use((req, res, next) => (LARGE_BODY.test(req.path) ? large : small)(req, res, next));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  // review P1-C2: NUL characters are never valid user input and poison Postgres jsonb — reject the request.
  app.use((req, _res, next) => {
    const bad = (v: unknown, d = 0): boolean => d < 8 && (typeof v === "string" ? v.includes("\u0000")
      : Array.isArray(v) ? v.some(x => bad(x, d + 1)) : !!v && typeof v === "object" && Object.values(v).some(x => bad(x, d + 1)));
    if (req.body && bad(req.body)) return next(new AppError(400, "INVALID_CHARACTERS", "Request contains invalid characters"));
    next();
  });
}

function setupRequestLog(app: Express) {
  app.use((req, res, next) => {
    const start = Date.now();
    // P1.10: correlation id (accept a sane upstream id, else generate); echoed to the client for support.
    const incoming = req.header("x-request-id");
    const reqId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    (req as Request & { id?: string }).id = reqId;
    res.setHeader("X-Request-Id", reqId);
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      // Never log bodies, query strings (may contain tokens) or headers — rule 2.
      logger.info("request", { reqId, tenant: res.getHeader("X-Tenant"), method: req.method, route: req.route?.path ?? req.path.replace(/[0-9a-f-]{20,}/g, ":id"), status: res.statusCode, ms: Date.now() - start });
    });
    next();
  });
}

function proxyToMetro(req: Request, res: Response) {
  const proxyReq = http.request({ hostname: "127.0.0.1", port: 8080, path: req.url, method: req.method, headers: { ...req.headers, host: "localhost:8080" } }, (pr) => {
    res.writeHead(pr.statusCode ?? 200, pr.headers);
    pr.pipe(res, { end: true });
  });
  proxyReq.on("error", () => { if (!res.headersSent) res.status(502).json({ code: "METRO_UNAVAILABLE", message: "Expo dev server not available" }); });
  req.pipe(proxyReq);
}

/**
 * The Expo web build's index.html plus what makes it an installable web app on Android and iPhone:
 * manifest, icons, theme colour, iOS standalone tags, notch-safe viewport and the service-worker script.
 */
let pwaCache: { mtime: number; base: string; html: string } | null = null;
const SITE_TITLE = "SANKALP AI — Report civic issues, track the fix, SOS for every Indian state";
const SITE_DESC = "Report potholes, garbage, water and power problems in under a minute, track them to a photo-verified fix, and get help fast with women-safety SOS. Works in every Indian state and UT; your data stays in India.";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** Instant loading screen inside #root (React replaces it when the app renders). Pure HTML/CSS: works before any JS. */
const BOOT_CSS = "#boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#F7F3EE;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1F1A17;text-align:center;padding:24px}"
  + "#boot .mark{width:84px;height:84px;border-radius:22px;background:linear-gradient(135deg,#FF9933,#C2410C 55%,#138808);display:flex;align-items:center;justify-content:center;color:#fff;font-size:46px;font-weight:900;box-shadow:0 10px 30px rgba(194,65,12,.35)}"
  + "#boot h1{margin:4px 0 0;font-size:24px;letter-spacing:.5px}#boot p{margin:0;font-size:14px;color:#5B4A3B}"
  + "#boot .spin{width:28px;height:28px;border:3px solid #E7DCD0;border-top-color:#C2410C;border-radius:50%;animation:bootspin .8s linear infinite}"
  + "#boot .slow{opacity:0;animation:bootshow .4s ease 8s forwards;font-size:13px;color:#5B4A3B}#boot .slow a{display:inline-block;margin-top:10px;background:#B91C1C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:12px}"
  + "@keyframes bootspin{to{transform:rotate(360deg)}}@keyframes bootshow{to{opacity:1}}";
const BOOT_HTML = '<div id="boot" role="status" aria-live="polite"><div class="mark" aria-hidden="true">S</div><h1>SANKALP AI</h1><p>Loading your civic app…</p><div class="spin" aria-hidden="true"></div>'
  + '<div class="slow">Slow connection — please wait a few seconds.<br/><a href="tel:112">Emergency? Call 112</a></div></div>';
function pwaHead(base: string): string {
  const abs = (p: string) => (base ? base + p : p);
  const ld = { "@context": "https://schema.org", "@type": "WebApplication", name: "SANKALP AI", url: abs("/"), applicationCategory: "GovernmentApplication",
    operatingSystem: "Android, iOS, Web", inLanguage: ["en-IN", "hi-IN"], description: SITE_DESC, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } };
  return [
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    `<meta name="description" content="${esc(SITE_DESC)}" />`,
    '<meta name="keywords" content="civic complaints, grievance, pothole, garbage, women safety, SOS, India, municipal, smart city" />',
    '<meta name="robots" content="index, follow" />',
    ...(base ? [`<link rel="canonical" href="${esc(abs("/"))}" />`] : []),
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="SANKALP AI" />',
    '<meta property="og:locale" content="en_IN" />',
    `<meta property="og:title" content="${esc(SITE_TITLE)}" />`,
    `<meta property="og:description" content="${esc(SITE_DESC)}" />`,
    `<meta property="og:url" content="${esc(abs("/"))}" />`,
    `<meta property="og:image" content="${esc(abs("/pwa/og-image.png"))}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="SANKALP AI — report civic issues, track them to a verified fix" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(SITE_TITLE)}" />`,
    `<meta name="twitter:description" content="${esc(SITE_DESC)}" />`,
    `<meta name="twitter:image" content="${esc(abs("/pwa/og-image.png"))}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    '<meta name="theme-color" content="#C2410C" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="icon" type="image/png" sizes="192x192" href="/pwa/icon-192.png" />',
    '<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="apple-mobile-web-app-title" content="SANKALP AI" />',
    '<meta name="format-detection" content="telephone=no" />',
    '<meta name="color-scheme" content="only light" />',
    // Shown the instant the page arrives, before the ~1 MB app code downloads on a phone (was a blank screen for 5-9 s).
    `<style>html,body{background:#F7F3EE;color-scheme:only light}${BOOT_CSS}</style>`,
    '<script src="/pwa/register.js" defer></script>',
  ].join("");
}
function pwaIndex(file: string): string {
  const mtime = fs.statSync(file).mtimeMs;
  const base = (config().PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  if (pwaCache?.mtime === mtime && pwaCache.base === base) return pwaCache.html;
  const html = fs.readFileSync(file, "utf8")
    .replace(/<meta name="viewport"[^>]*>/, "")
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(SITE_TITLE)}</title>`)
    .replace('<html lang="en">', '<html lang="en-IN">')
    .replace("</head>", `${pwaHead(base)}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${BOOT_HTML}</div>`);
  pwaCache = { mtime, base, html };
  return html;
}

/** Version of the shared portal script (its file time): a new deploy changes the URL, so a browser never pairs a
 *  fresh portal page with a cached old script (that mismatch blanked the PCR page after an update). */
let commonJsVer: { mtime: number; v: string } | null = null;
function commonJsVersion(): string {
  const f = path.join(ROOT, "server", "web", "vendor", "sankalp-common.js");
  try {
    const mtime = fs.statSync(f).mtimeMs;
    if (commonJsVer?.mtime !== mtime) commonJsVer = { mtime, v: Math.round(mtime).toString(36) };
    return commonJsVer.v;
  } catch { return "0"; }
}

/** Portals get the runtime config injected (demo badge, tile URL) without inline user data. */
function portalFile(file: string) {
  const full = path.join(ROOT, "server", "web", file);
  return (_req: Request, res: Response) => {
    const html = compiledPortal(full);
    const t = tenant();
    // P9: the selected state's public config, so no portal hard-codes a state's districts, departments or name.
    const cfg = {
      demoMode: config().DEMO_MODE, mapTileUrl: config().mapTileUrl,
      tenant: {
        id: t.id, name: t.name, nameLocal: t.nameLocal ?? t.name, stateLabel: t.stateLabel, coverage: t.coverage, ticketPrefix: t.ticketPrefix,
        mapBounds: t.mapBounds, helplines: t.helplines, defaultDistrict: t.defaultDistrict, audioDays: t.retention.sosAudioDays,
        districts: t.districts.map(d => ({ name: d.district, center: d.center })),
        departments: Object.values(t.departments).map(d => ({ id: d.id, name: d.name, nameLocal: d.nameHindi, icon: d.icon, color: d.color, slaHours: d.slaHours, categories: d.categories, helpline: d.helpline })),
      },
    };
    const inject = `<script>window.__SANKALP__=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script><script src="/web/vendor/sankalp-common.js?v=${commonJsVersion()}"></script>`;
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(html.replace("</head>", `${inject}</head>`));
  };
}

function setupStatic(app: Express) {
  const c = config();
  const webDir = path.join(ROOT, "static-build", "web");
  const webIndex = path.join(webDir, "index.html");

  // Expo Go manifest (native) — static build if present, Metro in development.
  app.get(["/", "/manifest"], (req, res, next) => {
    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      const manifest = path.join(ROOT, "static-build", platform, "manifest.json");
      if (fs.existsSync(manifest)) {
        res.setHeader("expo-protocol-version", "1");
        res.setHeader("expo-sfv-version", "0");
        return res.type("application/json").send(fs.readFileSync(manifest, "utf8"));
      }
      if (c.NODE_ENV === "development") return proxyToMetro(req, res);
      return res.status(404).json({ code: "NO_MANIFEST", message: "Native manifest not built" });
    }
    next();
  });

  if (c.NODE_ENV === "development") {
    app.use((req, res, next) => {
      const metro = req.path.endsWith(".bundle") || req.path === "/status" || req.path === "/symbolicate" || req.path.startsWith("/_expo/") && !fs.existsSync(path.join(webDir, req.path));
      return metro ? proxyToMetro(req, res) : next();
    });
  }

  for (const [route, file] of Object.entries({ dept: "dept.html", cpr: "cpr.html", pcr: "pcr.html", video: "video.html", public: "public.html", rti: "rti.html", portal: "portal.html", privacy: "privacy.html" })) {
    app.get([`/web/${route}`, `/web/${route}/`], portalFile(file));
  }
  app.get("/dept", portalFile("dept.html"));
  // Review P5 low: vendor file names are not content-hashed (sankalp-common.js changes) — revalidate daily.
  app.use("/web/vendor", express.static(path.join(ROOT, "server", "web", "vendor"), { maxAge: "1d" }));

  // M2: only validated images live here; nosniff + attachment-safe headers.
  app.use("/uploads", express.static(dirs().publicDir, {
    dotfiles: "deny", index: false,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (!/\.(jpg|png|webp)$/.test(filePath)) res.setHeader("Content-Disposition", "attachment");
    },
  }));

  // Web app / PWA: the service worker must always be revalidated so updates reach installed apps.
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Service-Worker-Allowed", "/");
    res.type("application/javascript").sendFile(path.join(ROOT, "public", "sw.js"));
  });
  // Search engines: index the public pages only, never the API.
  app.get("/robots.txt", (_req, res) => {
    const base = (config().PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("text/plain").send(["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /admin", ...(base ? [`Sitemap: ${base}/sitemap.xml`] : [])].join("\n") + "\n");
  });
  app.get("/sitemap.xml", (_req, res) => {
    const base = (config().PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) return res.status(404).end();
    const pages = ["/", "/web/transparency"];
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>\n`);
  });
  app.get("/manifest.webmanifest", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/manifest+json").sendFile(path.join(ROOT, "public", "manifest.webmanifest"));
  });
  app.use(express.static(path.join(ROOT, "public"), { dotfiles: "deny", maxAge: "7d" }));
  // P5.6: content-hashed bundle files never change — cache them for a year (2G users download once).
  app.use("/_expo/static", express.static(path.join(webDir, "_expo", "static"), { dotfiles: "deny", index: false, immutable: true, maxAge: "365d" }));
  app.use(express.static(webDir, { dotfiles: "deny", index: false }));

  const dehash = (req: Request, _res: Response, next: NextFunction) => {
    const d = req.path.replace(/\.([a-f0-9]{32})(\.[^./]+)$/, "$2");
    if (d !== req.path) req.url = d;
    next();
  };
  // M11: no general node_modules exposure — only allow-listed font/icon files.
  app.use("/assets/node_modules", dehash, (req, res, next) => (NODE_MODULE_ASSETS.test(req.path) ? next() : res.status(404).end()),
    express.static(path.join(ROOT, "node_modules"), { dotfiles: "deny", index: false, maxAge: "7d", fallthrough: false }));
  app.use("/assets/assets", dehash, express.static(path.join(ROOT, "assets"), { dotfiles: "deny", maxAge: "7d" }));
  app.use("/assets", dehash, express.static(path.join(ROOT, "assets"), { dotfiles: "deny" }));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/_expo") || req.path.startsWith("/assets") || req.path.startsWith("/uploads")) return next();
    if (fs.existsSync(webIndex)) {
      res.setHeader("Cache-Control", "no-store");
      return res.type("html").send(pwaIndex(webIndex));
    }
    const tpl = path.join(ROOT, "server", "templates", "landing-page.html");
    if (fs.existsSync(tpl)) return res.type("html").send(fs.readFileSync(tpl, "utf8").replace(/APP_NAME_PLACEHOLDER/g, "SANKALP AI").replace(/(BASE|EXPS)_URL_PLACEHOLDER/g, ""));
    next();
  });
}

export interface Built { app: Express; server: Server }

export function createApp(): Built {
  const app = express();
  // P5.6: gzip responses (≈4× smaller on 2G). SSE streams are excluded — they must not be buffered.
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => !req.path.endsWith("/stream") && !String(res.getHeader("Content-Type") ?? "").includes("text/event-stream") && compression.filter(req, res),
  }));
  app.disable("x-powered-by");
  app.set("trust proxy", config().TRUST_PROXY);
  setupSecurityHeaders(app);
  setupCors(app);
  setupBody(app);
  setupRequestLog(app);
  app.use((_req, res, next) => {
    if (config().DEMO_MODE) res.setHeader("X-Sankalp-Demo", "true");
    next();
  });
  // P1.3: bind every request to exactly one tenant (X-Tenant header → ?tenant= (EventSource/links) → Host → default).
  app.use((req, res, next) => {
    let id = resolveTenantFromRequest(req.header("x-tenant") || (typeof req.query?.tenant === "string" ? req.query.tenant : undefined), req.header("host") || undefined);
    // A stale ?tenant= on a page (state removed, STATE_REGISTRY=off) must not lock the portal: serve the
    // host/default state and let the page clear the stale choice. APIs keep failing closed with 404.
    if (!id && req.method === "GET" && !req.path.startsWith("/api/") && !req.header("x-tenant")) id = resolveTenantFromRequest(undefined, req.header("host") || undefined);
    if (!id) return res.status(404).json({ code: "UNKNOWN_TENANT", message: "Unknown tenant" });
    res.setHeader("X-Tenant", id);
    runInTenant(id, () => next());
  });

  registry.length = 0;
  registerPublicRoutes(app);
  registerAuthRoutes(app);
  registerMediaRoutes(app);
  registerComplaintRoutes(app);
  registerSosRoutes(app);
  registerCprRoutes(app);
  registerDeptRoutes(app);
  registerAdminRoutes(app);
  registerAiRoutes(app);
  registerCitizenRoutes(app);
  registerPrivacyRoutes(app);
  registerVerificationRoutes(app);
  registerAgentRoutes(app);
  registerChannelRoutes(app);
  registerSafetyRoutes(app);
  registerCheckInRoutes(app);
  registerDisasterRoutes(app);
  registerYatraRoutes(app);
  registerTransparencyRoutes(app);

  app.use("/api", (_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Unknown API route")));
  setupStatic(app);
  app.use(errorHandler);

  const server = createServer(app);
  attachRealtime(server);
  return { app, server };
}
