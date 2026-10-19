import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { Hono } from "hono";
import { type AppEnv, createSession, createToken, endSession, hashPassword, requireAdmin, requireSession, verifyPassword } from "../auth.ts";
import { all, one } from "../db.ts";
import { today } from "../domain.ts";

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const Me = z
  .object({
    user: z.object({ id: z.number(), email: z.string(), name: z.string(), role: z.string() }),
    via: z.enum(["web", "api", "claude"]),
    today: z.string(),
    app_url: z.string().nullable(),
  })
  .openapi("Me");

export const APP_NAME = "Infinity Pipeline";

/** Routes publiques d'authentification de l'interface web (cookie de session). */
export function authRoutes() {
  const app = new Hono<AppEnv>();
  app.post("/login", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const user = one<{ id: number; password_hash: string }>(c.var.db, "SELECT id, password_hash FROM users WHERE email = :email", { email });
    if (!user || !verifyPassword(password, user.password_hash)) {
      return c.json({ error: "Adresse e-mail ou mot de passe incorrect." }, 401);
    }
    createSession(c.var.db, c, user.id);
    return c.json({ ok: true });
  });
  app.post("/logout", (c) => {
    endSession(c.var.db, c);
    return c.json({ ok: true });
  });
  return app;
}

export function registerAccountRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/me",
      tags: ["Session"],
      operationId: "whoami",
      summary: "Personne connectée et date du jour",
      description: "À appeler avant de travailler avec des dates relatives (« cette semaine », « en retard »).",
      responses: { 200: json(Me, "Personne connectée") },
    }),
    (c) => c.json({ user: c.var.actor.user, via: c.var.actor.via, today: today(), app_url: process.env.PUBLIC_URL ?? null }, 200),
  );

  // Gestion des jetons : réservée à l'interface web, absente de la spec publique.
  app.get("/tokens", (c) =>
    c.json({
      mcp_url: process.env.MCP_URL ?? null,
      results: all(
        c.var.db,
        "SELECT id, name, kind, prefix, created_at, expires_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = :id ORDER BY id DESC",
        { id: c.var.actor.user.id },
      ),
    }),
  );
  app.post("/tokens", async (c) => {
    const denied = requireSession(c);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim() || "Claude";
    const kind = body.kind === "api" ? "api" : "claude";
    const days = body.days === null ? null : [30, 90, 365].includes(Number(body.days)) ? Number(body.days) : 90;
    const token = createToken(c.var.db, c.var.actor.user.id, name, kind, days);
    return c.json({ ...token, name, kind, mcp_url: process.env.MCP_URL ?? null }, 201);
  });
  app.delete("/tokens/:id", (c) => {
    const denied = requireSession(c);
    if (denied) return denied;
    c.var.db
      .prepare("UPDATE api_tokens SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(Number(c.req.param("id")), c.var.actor.user.id);
    return c.body(null, 204);
  });

  // Utilisateurs : liste pour tous, création réservée aux administrateurs (via l'interface).
  app.get("/users", (c) => c.json({ results: all(c.var.db, "SELECT id, email, name, role, created_at FROM users ORDER BY name") }));
  app.post("/users", async (c) => {
    const denied = requireSession(c) ?? requireAdmin(c);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    if (!email.includes("@") || !name || password.length < 10) {
      return c.json({ error: "Nom, adresse e-mail et mot de passe d'au moins 10 caractères requis." }, 400);
    }
    try {
      const result = c.var.db
        .prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)")
        .run(email, name, hashPassword(password), body.role === "admin" ? "admin" : "member");
      return c.json({ id: Number(result.lastInsertRowid), email, name }, 201);
    } catch {
      return c.json({ error: `Un utilisateur existe déjà avec l'adresse ${email}.` }, 409);
    }
  });
  app.post("/me/password", async (c) => {
    const denied = requireSession(c);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const user = one<{ password_hash: string }>(c.var.db, "SELECT password_hash FROM users WHERE id = :id", { id: c.var.actor.user.id })!;
    if (!verifyPassword(String(body.current ?? ""), user.password_hash)) return c.json({ error: "Mot de passe actuel incorrect." }, 400);
    if (String(body.next ?? "").length < 10) return c.json({ error: "Le nouveau mot de passe doit faire au moins 10 caractères." }, 400);
    c.var.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(String(body.next)), c.var.actor.user.id);
    return c.json({ ok: true });
  });
}
