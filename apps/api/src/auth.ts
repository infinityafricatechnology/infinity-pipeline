import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { one } from "./db.ts";

export type User = { id: number; email: string; name: string; role: "admin" | "member" };
/** Canal d'une modification : interface web, API avec un jeton, ou Claude (jeton du connecteur MCP). */
export type Via = "web" | "api" | "claude";
export type Actor = { user: User; via: Via; tokenId: number | null };

export type AppEnv = { Variables: { actor: Actor; db: DatabaseSync } };

const SESSION_COOKIE = "iat_session";
const SESSION_DAYS = 30;
export const TOKEN_PREFIX = "iat_";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function createSession(db: DatabaseSync, c: Context, userId: number): void {
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(id), userId, expires.toISOString());
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "Lax",
    secure: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
    path: "/",
    expires,
  });
}

export function endSession(db: DatabaseSync, c: Context): void {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha256(id));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Crée un jeton : seule son empreinte est conservée, la valeur n'est montrée qu'une fois. */
export function createToken(db: DatabaseSync, userId: number, name: string, kind: "claude" | "api", days: number | null) {
  const value = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const expires = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const result = db
    .prepare("INSERT INTO api_tokens (user_id, name, kind, token_hash, prefix, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, name, kind, sha256(value), value.slice(0, 10), expires);
  return { id: Number(result.lastInsertRowid), value, expires_at: expires };
}

function userFromToken(db: DatabaseSync, token: string): Actor | null {
  const row = one<User & { token_id: number; kind: "claude" | "api"; expires_at: string | null }>(
    db,
    `SELECT u.id, u.email, u.name, u.role, t.id AS token_id, t.kind, t.expires_at
       FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = :hash AND t.revoked_at IS NULL`,
    { hash: sha256(token) },
  );
  if (!row || (row.expires_at && row.expires_at < new Date().toISOString())) return null;
  db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.token_id);
  const { token_id, kind, expires_at: _, ...user } = row;
  return { user, via: kind === "claude" ? "claude" : "api", tokenId: token_id };
}

function userFromSession(db: DatabaseSync, c: Context): Actor | null {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const user = one<User>(
    db,
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = :hash AND s.expires_at > :now`,
    { hash: sha256(id), now: new Date().toISOString() },
  );
  return user ? { user, via: "web", tokenId: null } : null;
}

// Limite de débit par jeton : 300 requêtes par minute, comme pour le connecteur d'Infinity Planning.
const RATE_LIMIT = 300;
const hits = new Map<number, { windowStart: number; count: number }>();

function rateLimited(tokenId: number): boolean {
  const now = Date.now();
  const entry = hits.get(tokenId);
  if (!entry || now - entry.windowStart >= 60_000) {
    hits.set(tokenId, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

/**
 * Authentifie chaque requête de l'API : `Authorization: Bearer <jeton>` (ou `X-Api-Key`) pour les
 * programmes et Claude, cookie de session pour l'interface web.
 */
export function authenticate(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = c.var.db;
    const header = c.req.header("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : c.req.header("x-api-key");
    const actor = bearer ? userFromToken(db, bearer) : userFromSession(db, c);
    if (!actor) {
      return c.json(
        {
          error: bearer
            ? "Jeton invalide, expiré ou révoqué. Générez-en un nouveau dans Réglages > Connecter Claude."
            : "Connexion requise.",
        },
        401,
      );
    }
    if (actor.tokenId && rateLimited(actor.tokenId)) {
      return c.json({ error: "Limite de 300 requêtes par minute atteinte. Réessayez dans une minute." }, 429);
    }
    // Une session web ne peut modifier qu'en JSON : un formulaire d'un autre site ne peut pas envoyer ce type
    // sans requête préalable CORS, ce qui protège des requêtes forgées (CSRF).
    if (actor.via === "web" && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (!(c.req.header("content-type") ?? "").includes("application/json")) {
        return c.json({ error: "Les modifications doivent être envoyées en JSON." }, 415);
      }
    }
    c.set("actor", actor);
    await next();
  };
}

export function requireAdmin(c: Context<AppEnv>): Response | null {
  return c.var.actor.user.role === "admin" ? null : c.json({ error: "Réservé aux administrateurs." }, 403);
}

export function requireSession(c: Context<AppEnv>): Response | null {
  return c.var.actor.via === "web"
    ? null
    : c.json({ error: "Les jetons se gèrent depuis l'application, pas avec un jeton." }, 403);
}
