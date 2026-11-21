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
import { resolveTenantFromRequest, runInTenant } from "./tenancy";
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
  const tile = config().mapTileUrl;
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

/** Portals get the runtime config injected (demo badge, tile URL) without inline user data. */
function portalFile(file: string) {
  const full = path.join(ROOT, "server", "web", file);
  return (_req: Request, res: Response) => {
    const html = compiledPortal(full);
    const cfg = { demoMode: config().DEMO_MODE, mapTileUrl: config().mapTileUrl };
    const inject = `<script>window.__SANKALP__=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script><script src="/web/vendor/sankalp-common.js"></script>`;
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
      return res.sendFile(webIndex);
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
  // P1.3: bind every request to exactly one tenant (X-Tenant header → Host → default).
  app.use((req, res, next) => {
    const id = resolveTenantFromRequest(req.header("x-tenant") || undefined, req.header("host") || undefined);
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

  app.use("/api", (_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Unknown API route")));
  setupStatic(app);
  app.use(errorHandler);

  const server = createServer(app);
  attachRealtime(server);
  return { app, server };
}
