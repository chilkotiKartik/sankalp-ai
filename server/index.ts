import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>([
      "https://sankalp-ai.replit.app", // production domain — always allowed
    ]);

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
      origins.add(`https://8080-${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    // Allow any Replit dev domain (covers all developer preview origins)
    const isReplitDev = !!origin?.match(/https:\/\/[\w-]+\.pike\.replit\.dev$|https:\/\/[\w-]+-\d+\.[\w-]+\.replit\.dev$|https:\/\/[\w-]+\.replit\.dev$/);

    // No origin = mobile/native app (Expo Go) — always allow
    // Known origin = web browser — allow if in set, localhost, or any replit.dev
    const allowed = !origin || origins.has(origin) || isLocalhost || isReplitDev;
    if (allowed) {
      res.header("Access-Control-Allow-Origin", origin ?? "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (origin) res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function proxyToMetro(req: Request, res: Response) {
  const rawBody: Buffer | undefined = req.rawBody as Buffer | undefined;
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: "localhost:8080" };
  if (rawBody) {
    headers["content-length"] = rawBody.length;
  } else {
    delete headers["content-length"];
  }
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: 8080,
    path: req.url,
    method: req.method,
    headers,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    log(`[Expo proxy error] ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: "Expo dev server not available on port 8080" });
    }
  });
  if (rawBody && rawBody.length > 0) {
    proxyReq.write(rawBody);
  }
  proxyReq.end();
}

function serveExpoManifest(platform: string, req: Request, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    log(`[Expo] No static manifest for ${platform} — proxying to Metro dev server`);
    return proxyToMetro(req, res);
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  // Use the Expo Dev Server domain + port 8080 for QR code so Expo Go connects to Metro directly
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const expsUrl = devDomain ? `${devDomain}:8080` : host;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl ?? "")
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    // Proxy Metro-specific paths (JS bundles, HMR, source maps, etc.) to Expo dev server
    const isMetroPath =
      req.path.startsWith("/_expo/") ||
      req.path.startsWith("/node_modules/") ||
      req.path.endsWith(".bundle") ||
      req.path.startsWith("/debugger-ui") ||
      req.path === "/status" ||
      req.path === "/symbolicate" ||
      req.path === "/open-stack-frame" ||
      req.path.startsWith("/inspector");
    if (isMetroPath) {
      return proxyToMetro(req, res);
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, req, res);
    }

    if (req.path === "/") {
      // Always serve the landing page at root — shows Expo Go QR code + web app link
      return serveLandingPage({ req, res, landingPageTemplate, appName });
    }

    next();
  });

  // ── WEB PORTALS ───────────────────────────────────────────────────────────────
  const portalRoute = (file: string) => (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(process.cwd(), "server", "web", file));
  };
  app.get("/dept",        portalRoute("dept.html"));
  app.get("/web/dept",    portalRoute("dept.html"));
  app.get("/web/dept/",   portalRoute("dept.html"));
  app.get("/web/cpr",     portalRoute("cpr.html"));
  app.get("/web/cpr/",    portalRoute("cpr.html"));
  app.get("/web/pcr",     portalRoute("pcr.html"));
  app.get("/web/pcr/",    portalRoute("pcr.html"));
  app.get("/web/video",   portalRoute("video.html"));
  app.get("/web/video/",  portalRoute("video.html"));
  app.get("/web/public",  portalRoute("public.html"));
  app.get("/web/public/", portalRoute("public.html"));
  app.get("/web/rti",     portalRoute("rti.html"));
  app.get("/web/rti/",    portalRoute("rti.html"));
  app.get("/web/portal",  portalRoute("portal.html"));
  app.get("/web/portal/", portalRoute("portal.html"));

  // Serve uploaded files (complaint photos, audio recordings, etc.)
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), {
    setHeaders: (res) => { res.setHeader("Cache-Control", "public, max-age=86400"); }
  }));

  // Serve self-hosted public assets (Leaflet, etc.) — avoids CDN blocking in production
  app.use(express.static(path.resolve(process.cwd(), "public"), {
    setHeaders: (res) => { res.setHeader("Cache-Control", "public, max-age=604800"); }
  }));

  // Serve the built web bundle first so hashed asset filenames are resolved correctly
  app.use(express.static(path.resolve(process.cwd(), "static-build", "web")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));
  // Raw source assets as fallback (for icons, splash, etc. not hashed by Metro)
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  // SPA fallback — all non-API, non-static routes serve index.html for client-side routing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/_expo") || req.path.startsWith("/assets")) {
      return next();
    }
    const webIndexPath = path.resolve(process.cwd(), "static-build", "web", "index.html");
    if (fs.existsSync(webIndexPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.sendFile(webIndexPath);
    }
    next();
  });

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
