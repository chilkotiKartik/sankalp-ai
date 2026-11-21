/** m19 — `npm run openapi` : writes docs/openapi.json from the live route registry. */
import * as fs from "node:fs";

async function main() {
  // Placeholder secrets: generation never serves requests or signs anything.
  process.env.JWT_SECRET ||= "openapi-generation-only-secret-000000000000";
  process.env.DEPT_JWT_SECRET ||= "openapi-generation-only-dept-secret-0000000";
  const { createApp } = await import("../server/app");
  const { buildOpenApi } = await import("../server/openapi");
  const { closeRealtime } = await import("../server/realtime");
  createApp();
  const doc = buildOpenApi();
  fs.writeFileSync("docs/openapi.json", JSON.stringify(doc, null, 2) + "\n");
  closeRealtime();
  process.stdout.write(`docs/openapi.json: ${Object.keys(doc.paths as object).length} paths\n`);
  process.exit(0);
}

void main();
