import * as fs from "node:fs";
import { transformSync } from "@babel/core";
import { logger } from "./logger";

/**
 * P5.6: the HTML portals were compiled in the browser by babel-standalone (≈ 3 MB of script plus seconds of CPU on
 * every load). The server now compiles each `<script type="text/babel">` block once (cached per file mtime) and drops
 * babel-standalone from the page. If compilation fails, the original page is served unchanged (it still works).
 */
const cache = new Map<string, { mtime: number; html: string }>();
const STANDALONE = /<script src="\/web\/vendor\/babel-standalone-[\d.]+\.min\.js"><\/script>\s*/;
const BLOCK = /<script type="text\/babel">([\s\S]*?)<\/script>/g;

export function compiledPortal(file: string): string {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.html;
  const src = fs.readFileSync(file, "utf8");
  let html = src;
  try {
    if (BLOCK.test(src)) {
      BLOCK.lastIndex = 0;
      html = src.replace(BLOCK, (_m, code: string) => {
        const out = transformSync(code, { presets: [["@babel/preset-react", { runtime: "classic" }]], babelrc: false, configFile: false, compact: true, comments: false, sourceType: "script" });
        // "</script" inside the compiled code would end the tag early.
        return `<script>${(out?.code ?? "").replace(/<\/script/gi, "<\\/script")}</script>`;
      }).replace(STANDALONE, "");
    }
  } catch (err) {
    logger.error("portal_compile_failed", { file, err: (err as Error).message });
    html = src;
  }
  cache.set(file, { mtime, html });
  return html;
}
