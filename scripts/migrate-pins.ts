/**
 * M15 — `npm run migrate:pins`
 * Re-hashes any plaintext PIN left in the snapshot with bcrypt (cost 12) and rewrites the snapshot atomically.
 * Login also re-hashes on first successful use; this script covers dormant accounts.
 * Prints counts only — never phone numbers or PINs.
 */
import bcrypt from "bcrypt";
import { storage } from "../server/storage";
import { loadSnapshot, saveSnapshot, snapshotPath } from "../server/persistence";

async function main() {
  if (!loadSnapshot(storage)) {
    process.stdout.write(`No snapshot at ${snapshotPath()} — nothing to migrate.\n`);
    return;
  }
  let migrated = 0;
  for (const u of storage.s.users) {
    if (u.pin && !/^\$2[aby]\$/.test(u.pin)) {
      u.pin = await bcrypt.hash(u.pin, 12);
      migrated++;
    }
  }
  if (migrated) { storage.touch(); saveSnapshot(storage); }
  process.stdout.write(`Users: ${storage.s.users.length}. Plaintext PINs re-hashed: ${migrated}.\n`);
}

void main();
