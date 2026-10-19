import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type Row = Record<string, unknown>;
export type Params = Record<string, SQLInputValue>;

const ROOT = resolve(import.meta.dirname, "../../..");

export function openDatabase(path = process.env.DATABASE_PATH ?? "data/iat.db"): DatabaseSync {
  const file = path === ":memory:" ? path : resolve(ROOT, path);
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(readFileSync(resolve(import.meta.dirname, "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

/** Mises à jour des bases créées par une version précédente (le schéma ne fait que CREATE IF NOT EXISTS). */
function migrate(db: DatabaseSync) {
  const columns = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes("password_changed_at")) db.exec("ALTER TABLE users ADD COLUMN password_changed_at TEXT");
}

export function all<T = Row>(db: DatabaseSync, sql: string, params: Params = {}): T[] {
  return db.prepare(sql).all(params) as T[];
}

export function one<T = Row>(db: DatabaseSync, sql: string, params: Params = {}): T | undefined {
  return db.prepare(sql).get(params) as T | undefined;
}

/** Exécute ``fn`` dans une transaction : tout ou rien. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const projectRoot = ROOT;
