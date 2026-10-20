/**
 * Charge data/seed.json (produit par `pnpm import-xlsx` depuis le classeur Excel) dans une base vide,
 * puis crée le premier administrateur.
 *
 *   pnpm seed            base vide seulement
 *   pnpm seed --force    efface les données métier puis recharge (utilisateurs et jetons conservés)
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { hashPassword, verifyPassword } from "../auth.ts";
import { one, openDatabase, projectRoot, transaction } from "../db.ts";

type Item = Record<string, unknown>;

const BUSINESS_TABLES = ["activity", "pitches", "prospects", "solutions", "actions", "contacts", "opportunities", "renewals", "invoices", "deals", "tenders", "accounts"];

function insert(db: DatabaseSync, table: string, row: Item): number {
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => `:${c}`).join(", ")})`;
  const values = Object.fromEntries(cols.map((c) => [c, typeof row[c] === "boolean" ? Number(row[c]) : (row[c] as SQLInputValue)]));
  return Number(db.prepare(sql).run(values).lastInsertRowid);
}

export function loadSeed(db: DatabaseSync, data: Record<string, Item[]>) {
  const accountIds = new Map<string, number>();
  const solutionIds = new Map<string, number>();
  const account = (key: unknown) => (key ? (accountIds.get(String(key)) ?? null) : null);

  for (const { key, ...a } of data.accounts) accountIds.set(String(key), insert(db, "accounts", { ...a, slug: key }));
  for (const { account: k, ...d } of data.deals) insert(db, "deals", { ...d, account_id: account(k) });
  for (const { account: k, ...i } of data.invoices) insert(db, "invoices", { ...i, account_id: account(k) });
  for (const { account: k, ...r } of data.renewals) insert(db, "renewals", { ...r, account_id: account(k) });
  for (const { account: k, ...o } of data.opportunities) insert(db, "opportunities", { ...o, account_id: account(k) });
  for (const { account: k, ...c } of data.contacts) insert(db, "contacts", { ...c, account_id: account(k) });
  for (const t of data.tenders) insert(db, "tenders", t);
  for (const s of data.solutions) solutionIds.set(String(s.name), insert(db, "solutions", s));
  const solution = (name: unknown) => {
    const id = solutionIds.get(String(name));
    if (!id) throw new Error(`Solution inconnue dans les données : ${name}`);
    return id;
  };
  for (const { solution: s, ...p } of data.prospects) insert(db, "prospects", { ...p, solution_id: solution(s) });
  for (const { solution: s, ...p } of data.pitches) insert(db, "pitches", { ...p, solution_id: solution(s) });
  for (const { account: k, ...a } of data.actions) insert(db, "actions", { ...a, account_id: account(k) });
}

/**
 * Crée l'administrateur au premier démarrage. Ensuite, tant qu'il n'a pas choisi lui-même son mot de passe
 * (Réglages), celui d'IAT_ADMIN_PASSWORD lui est réappliqué : changer la configuration suffit.
 */
function ensureAdmin(db: DatabaseSync) {
  const email = process.env.IAT_ADMIN_EMAIL || "admin@iat.ci";
  const configured = process.env.IAT_ADMIN_PASSWORD;
  const admin = one<{ id: number; password_hash: string; password_changed_at: string | null }>(
    db,
    "SELECT id, password_hash, password_changed_at FROM users WHERE email = :email",
    { email },
  );
  if (admin) {
    if (configured && !admin.password_changed_at && !verifyPassword(configured, admin.password_hash)) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(configured), admin.id);
      console.log(`Mot de passe de ${email} mis à jour depuis IAT_ADMIN_PASSWORD.`);
    }
    return;
  }
  if (one(db, "SELECT id FROM users LIMIT 1")) return;
  const name = process.env.IAT_ADMIN_NAME || "Administrateur IAT";
  const generated = !process.env.IAT_ADMIN_PASSWORD;
  const password = process.env.IAT_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(email, name, hashPassword(password));
  console.log(`Administrateur créé : ${email}`);
  if (generated) console.log(`Mot de passe généré (à changer après la première connexion) : ${password}`);
}

if (import.meta.main) {
  const force = process.argv.includes("--force");
  const file = resolve(projectRoot, process.env.SEED_PATH ?? "data/seed.json");
  const db = openDatabase();
  const hasData = one(db, "SELECT id FROM accounts LIMIT 1");
  if (hasData && !force) {
    console.log("La base contient déjà des données : rien n'est rechargé (utilisez --force pour tout recharger).");
  } else if (!existsSync(file)) {
    console.error(`Fichier ${file} introuvable : lancez d'abord \`pnpm import\`.`);
    process.exitCode = 1;
  } else {
    const data = JSON.parse(readFileSync(file, "utf8"));
    transaction(db, () => {
      if (force) for (const table of BUSINESS_TABLES) db.exec(`DELETE FROM ${table}`);
      loadSeed(db, data);
    });
    const counts = Object.fromEntries(
      ["accounts", "deals", "invoices", "renewals", "contacts", "actions", "prospects"].map((t) => [t, one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${t}`)!.n]),
    );
    console.log("Données chargées :", counts);
  }
  ensureAdmin(db);
  db.close();
}
