import type { DatabaseSync } from "node:sqlite";
import type { Actor } from "./auth.ts";
import type { Row } from "./db.ts";

export type Entity =
  | "account"
  | "deal"
  | "invoice"
  | "renewal"
  | "opportunity"
  | "contact"
  | "tender"
  | "solution"
  | "prospect"
  | "pitch"
  | "action"
  | "iap_deal"
  | "iap_action"
  | "iap_contact"
  | "iac_deal"
  | "iac_action"
  | "iac_contact"
  | "iaf_deal"
  | "iaf_action"
  | "iaf_contact"
  | "partner";

/** Filiale d'une entité : préfixe « iap_ », « iac_ », « iaf_ » ; les partenaires relèvent du Groupe ; sinon IAT. */
export function spaceOf(entity: string) {
  if (entity === "partner") return "iag";
  const prefix = entity.split("_")[0];
  return prefix === "iap" || prefix === "iac" || prefix === "iaf" ? prefix : "iat";
}

/** Différences champ par champ entre deux versions d'une ligne (horodatages exclus). */
export function diff(before: Row, after: Row): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(after)) {
    if (key === "updated_at" || key === "created_at") continue;
    if ((before[key] ?? null) !== (after[key] ?? null)) changes[key] = [before[key] ?? null, after[key] ?? null];
  }
  return changes;
}

export function logActivity(
  db: DatabaseSync,
  actor: Actor,
  entity: Entity,
  entityId: number,
  action: "create" | "update" | "delete",
  label: string | null,
  changes?: Record<string, unknown>,
): void {
  db.prepare(
    "INSERT INTO activity (user_id, via, entity, entity_id, action, label, changes, space) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(actor.user.id, actor.via, entity, entityId, action, label, changes ? JSON.stringify(changes) : null, spaceOf(entity));
}
