// Local entrypoint: open the embedded Postgres, migrate, seed, serve the API.
// `npm run server` — Node 24+ runs this TypeScript directly (type stripping).

import { PortalDb } from "./db/client.ts";
import { buildServer } from "./http.ts";

const port = Number(process.env.PORTAL_API_PORT ?? 4100);
const db = await PortalDb.open();
const server = buildServer(db);
server.listen(port, () => {
  console.log(`client-portal api on http://localhost:${port} (embedded Postgres, seeded)`);
});
