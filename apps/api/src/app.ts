import { OpenAPIHono } from "@hono/zod-openapi";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { type AppEnv, authenticate } from "./auth.ts";
import { ApiError } from "./resource.ts";
import { APP_NAME, authRoutes, registerAccountRoutes } from "./routes/account.ts";
import { registerInsights } from "./routes/insights.ts";
import { registerResources } from "./routes/resources.ts";

const API_DESCRIPTION = `API publique d'${APP_NAME}, le pipeline commercial d'IAT (Infinity Africa Technologies).

Authentification : \`Authorization: Bearer <jeton>\`. Les jetons se créent dans l'application, Réglages > Connecter Claude ;
les modifications faites avec un jeton « Claude » apparaissent « via Claude » dans le journal d'activité.

Conventions :
- montants en FCFA (entiers), dates au format AAAA-MM-JJ, probabilités (closing) entre 0 et 1 ;
- les valeurs dérivées (montant pondéré, échéances et alertes de renouvellement, retards) sont calculées et en lecture seule ;
- PATCH ne modifie que les champs envoyés ; \`null\` efface une valeur ;
- les routes \`/batch\` traitent jusqu'à 100 éléments, tout ou rien ;
- une erreur renvoie \`{ "error": "…" }\` en français, avec les valeurs admises quand une valeur est refusée ;
- 300 requêtes par minute et par jeton.`;

/** Normalise le texte pour la recherche : minuscules, sans accents. */
function unaccent(value: unknown): string | null {
  if (value == null) return null;
  return String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function createApp(db: DatabaseSync, options: { webDist?: string } = {}) {
  db.function("unaccent", { deterministic: true }, unaccent as never);

  const api = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
        const first = issues[0];
        return c.json({ error: `Valeur refusée pour « ${first.path || "corps"} » : ${first.message}`, issues }, 400);
      }
    },
  });

  api.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });
  api.route("/auth", authRoutes());
  api.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: { title: `${APP_NAME} API`, version: "1.0.0", description: API_DESCRIPTION },
    servers: [{ url: `${process.env.PUBLIC_URL ?? ""}/api/v1` }],
    security: [{ bearer: [] }],
  });
  api.openAPIRegistry.registerComponent("securitySchemes", "bearer", { type: "http", scheme: "bearer" });
  api.use("*", authenticate());
  registerAccountRoutes(api);
  registerInsights(api);
  registerResources(api);

  api.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Erreur interne. Réessayez plus tard." }, 500);
  });
  api.notFound((c) => c.json({ error: `Route inconnue : ${c.req.method} ${c.req.path}. Voir /api/v1/openapi.json.` }, 404));

  const app = new Hono();
  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));
  app.get("/healthz", (c) => c.json({ ok: true }));
  app.route("/api/v1", api);

  // Interface web compilée (apps/web/dist), avec repli sur index.html pour les routes du client.
  const dist = options.webDist;
  if (dist && existsSync(resolve(dist, "index.html"))) {
    const index = readFileSync(resolve(dist, "index.html"), "utf8");
    app.use("/assets/*", serveStatic({ root: dist, onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable") }));
    app.get("/assets/*", (c) => c.text("Fichier introuvable", 404));
    app.use("*", serveStatic({ root: dist }));
    app.get("*", (c) => c.html(index));
  }
  return app;
}
