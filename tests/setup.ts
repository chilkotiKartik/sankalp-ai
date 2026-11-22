import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Deterministic, isolated test configuration. Secrets here are test-only random values.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sankalp-test-"));
process.env.NODE_ENV = "test";
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789";
process.env.DEPT_JWT_SECRET = "test-dept-secret-abcdef0123456789abcdef01";
process.env.PUSH_DRIVER = "none";
process.env.EGRESS_ALLOWLIST = "api.sarvam.ai";
process.env.DEMO_MODE = "false";
process.env.LOG_LEVEL = "error";
