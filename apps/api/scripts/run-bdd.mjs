import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../", import.meta.url));
const cucumberBin = fileURLToPath(
  new URL("../node_modules/@cucumber/cucumber/bin/cucumber.js", import.meta.url),
);

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.BDD_DATABASE_URL ??
    "postgresql://smoothflow:changeme@localhost:5434/smoothflow_bdd",
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY ?? "dev-only-change-in-production-32b",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "bdd-local-session-secret",
};

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    cucumberBin,
    "--import",
    "features/**/*.ts",
    "features/**/*.feature",
  ],
  {
    cwd: apiDir,
    env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
