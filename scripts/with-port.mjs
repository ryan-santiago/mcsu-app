/**
 * Runs `next dev` / `next start` on the port from PORT in .env.local (or .env).
 *
 * Next's own CLI does not read `process.env.PORT` — it only listens to an
 * explicit `--port` flag, and its internal env-file loading happens after argv
 * is already parsed. Without this wrapper, PORT in .env.local is silently
 * ignored and the app always starts on 3000 regardless of what's configured.
 *
 * Usage: node scripts/with-port.mjs dev|start
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const port = process.env.PORT ?? "3000";
const nextArgs = process.argv.slice(2);

const child = spawn("next", [...nextArgs, "--port", port], {
  stdio: "inherit",
  // next.cmd on Windows is a shell script shim — spawn can't exec it directly.
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
