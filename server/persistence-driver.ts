import { config } from "./config";
import { loadAllSnapshots, startSnapshots, stopSnapshots } from "./persistence";

/**
 * Storage driver switch (P1.2): STORAGE_DRIVER=snapshot (default, needs only a disk) | postgres (needs DATABASE_URL).
 * Both drivers keep the same in-memory working set per tenant; they differ in where it is made durable.
 */
export async function startPersistence(): Promise<string[]> {
  if (config().STORAGE_DRIVER === "postgres") {
    const pg = await import("./db/pg-driver");
    return pg.startPostgres();
  }
  const restored = loadAllSnapshots();
  startSnapshots();
  return restored;
}

export async function stopPersistence(): Promise<void> {
  if (config().STORAGE_DRIVER === "postgres") {
    const pg = await import("./db/pg-driver");
    await pg.stopPostgres();
    return;
  }
  stopSnapshots();
}
