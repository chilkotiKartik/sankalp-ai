import { defineConfig } from "drizzle-kit";

// Generates server/db/migrations from server/db/schema.ts. Applying them happens at boot (server/db/pg-driver.ts),
// so no database connection is needed to generate.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
