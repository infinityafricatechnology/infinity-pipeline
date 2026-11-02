/**
 * Gestion des comptes utilisateurs en ligne de commande.
 *
 *   pnpm user add <email> "<Nom>" [--admin]     crée un compte, mot de passe généré
 *   pnpm user reset <email>                     génère un nouveau mot de passe
 *   pnpm user spaces <email> iat,iap            filiales accessibles (un admin a accès à tout)
 *   pnpm user list
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth.ts";
import { all, openDatabase } from "../db.ts";
import { parseSpaces } from "../spaces.ts";

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
} else if (command === "spaces" && email && name) {
  const spaces = parseSpaces(name);
  if (!spaces.length) {
    console.log("Espaces reconnus : iat, iap (séparés par des virgules).");
    process.exitCode = 1;
  } else {
    const result = db.prepare("UPDATE users SET spaces = ? WHERE email = ?").run(spaces.join(","), email);
    console.log(result.changes ? `Espaces de ${email} : ${spaces.join(", ")}` : `Aucun compte pour ${email}.`);
  }
} else if (command === "list") {
  console.table(all(db, "SELECT id, email, name, role, spaces, created_at FROM users ORDER BY id"));
} else {
  console.log('Usage : pnpm user add <email> "<Nom>" [--admin] | pnpm user reset <email> | pnpm user spaces <email> iat,iap | pnpm user list');
  process.exitCode = 1;
}
db.close();
