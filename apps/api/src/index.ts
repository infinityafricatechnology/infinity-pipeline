import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { openDatabase, projectRoot } from "./db.ts";

const db = openDatabase();
const app = createApp(db, { webDist: process.env.WEB_DIST ?? resolve(projectRoot, "apps/web/dist") });
const port = Number(process.env.PORT ?? 8300);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`Infinity Pipeline : http://localhost:${port} (API : /api/v1, spec : /api/v1/openapi.json)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.close();
    process.exit(0);
  });
}
