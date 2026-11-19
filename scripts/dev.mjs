// `npm run dev` — starts the API (embedded Postgres) and the Next.js dev
// server together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["server/index.ts"], { stdio: "inherit" }),
  spawn("npx.cmd", ["next", "dev", "frontend", "-p", "3110"], { stdio: "inherit", shell: false }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { if (code) { stop(); process.exit(code); } }));
