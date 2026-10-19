/**
 * Gestion des comptes utilisateurs en ligne de commande.
 *
 *   pnpm user add <email> "<Nom>" [--admin]     crée un compte, mot de passe généré
 *   pnpm user reset <email>                     génère un nouveau mot de passe
 *   pnpm user list
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth.ts";
import { all, openDatabase } from "../db.ts";

const [command, email, name] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const db = openDatabase();
const password = randomBytes(12).toString("base64url");

if (command === "add" && email && name) {
  const role = process.argv.includes("--admin") ? "admin" : "member";
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run(email, name, hashPassword(password), role);
  console.log(`Compte créé pour ${name} <${email}> (${role}). Mot de passe : ${password}`);
} else if (command === "reset" && email) {
  const result = db.prepare("UPDATE users SET password_hash = ?, password_changed_at = datetime('now') WHERE email = ?").run(hashPassword(password), email);
  console.log(result.changes ? `Nouveau mot de passe pour ${email} : ${password}` : `Aucun compte pour ${email}.`);
} else if (command === "list") {
  console.table(all(db, "SELECT id, email, name, role, created_at FROM users ORDER BY id"));
} else {
  console.log('Usage : pnpm user add <email> "<Nom>" [--admin] | pnpm user reset <email> | pnpm user list');
  process.exitCode = 1;
}
db.close();
