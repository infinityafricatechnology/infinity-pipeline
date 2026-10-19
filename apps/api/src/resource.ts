import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { diff, type Entity, logActivity } from "./activity.ts";
import type { Actor, AppEnv } from "./auth.ts";
import { all, one, type Params, type Row, transaction } from "./db.ts";

/** Nombre maximal d'éléments créés ou modifiés en un appel groupé. */
export const BATCH_MAX = 100;

export const ErrorSchema = z
  .object({ error: z.string(), issues: z.array(z.object({ path: z.string(), message: z.string() })).optional() })
  .openapi("Error");

export class ApiError extends Error {
  status: 400 | 403 | 404 | 409;
  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

export type Where = { clauses: string[]; params: Params };

export type ResourceSpec<Q extends z.ZodObject = z.ZodObject> = {
  entity: Entity;
  /** Segment d'URL, ex. « deals ». */
  path: string;
  table: string;
  tag: string;
  /** Nom en français, pour les messages : « l'affaire ». */
  noun: string;
  /** Champs modifiables, tels qu'acceptés à la création (les requis le sont ici). */
  input: z.ZodObject;
  /** Représentation renvoyée par l'API, calculs compris. */
  output: z.ZodObject;
  /** Filtres de la liste, en plus de `q`, `limit` et `offset`. */
  filters?: Q;
  where?: (query: z.infer<Q>) => Where;
  /** Colonnes parcourues par la recherche `q`. */
  search: string[];
  orderBy: string;
  /** SELECT de base, avec jointures éventuelles ; la table principale a l'alias `t`. */
  select?: string;
  present: (row: Row) => Row;
  label: (row: Row) => string;
  /** Complète ou contrôle les données avant écriture (ex. numéro automatique). */
  prepare?: (db: DatabaseSync, data: Row, existing: Row | null) => Row;
  deletable?: boolean;
  description?: string;
};

const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ param: { name: "id", in: "path" }, example: 12 }),
});

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const errors = {
  400: json(ErrorSchema, "Requête invalide : le message indique le champ fautif et, le cas échéant, les valeurs admises"),
  401: json(ErrorSchema, "Jeton absent, invalide ou expiré"),
  404: json(ErrorSchema, "Élément introuvable"),
};

function columnsOf(input: z.ZodObject): string[] {
  return Object.keys(input.shape);
}

/** Valeur prête pour SQLite : booléens en 0/1, le reste tel quel. */
function sqlValue(value: unknown): SQLInputValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value as SQLInputValue;
}

export function friendlySqlError(error: unknown, noun: string): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("FOREIGN KEY")) {
    throw new ApiError(400, "Référence inconnue : vérifiez l'identifiant du compte, de la solution ou du contact lié.");
  }
  if (message.includes("UNIQUE")) {
    throw new ApiError(409, `Conflit : ${noun} existe déjà avec cette valeur unique (${message.split(": ").pop()}).`);
  }
  if (message.includes("CHECK")) {
    throw new ApiError(400, `Valeur hors des bornes admises pour ${noun} (${message.split(": ").pop()}).`);
  }
  throw error;
}

export function makeRepository(db: DatabaseSync, spec: ResourceSpec) {
  const columns = columnsOf(spec.input);
  const base = spec.select ?? `SELECT t.* FROM ${spec.table} t`;

  const getRaw = (id: number) => one(db, `SELECT * FROM ${spec.table} WHERE id = :id`, { id });

  const get = (id: number) => {
    const row = one(db, `${base} WHERE t.id = :id`, { id });
    return row ? spec.present(row) : null;
  };

  const mustGetRaw = (id: number) => {
    const row = getRaw(id);
    if (!row) throw new ApiError(404, `${capitalize(spec.noun)} n° ${id} est introuvable.`);
    return row;
  };

  const create = (actor: Actor, data: Row) => {
    const prepared = spec.prepare ? spec.prepare(db, data, null) : data;
    const cols = columns.filter((c) => prepared[c] !== undefined);
    const sql = `INSERT INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map((c) => `:${c}`).join(", ")})`;
    let id: number;
    try {
      id = Number(db.prepare(sql).run(Object.fromEntries(cols.map((c) => [c, sqlValue(prepared[c])]))).lastInsertRowid);
    } catch (error) {
      friendlySqlError(error, spec.noun);
    }
    const created = mustGetRaw(id);
    logActivity(db, actor, spec.entity, id, "create", spec.label(created));
    return get(id)!;
  };

  const update = (actor: Actor, id: number, patch: Row) => {
    const before = mustGetRaw(id);
    const prepared = spec.prepare ? spec.prepare(db, patch, before) : patch;
    const cols = columns.filter((c) => prepared[c] !== undefined);
    if (cols.length > 0) {
      const sql = `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = :${c}`).join(", ")}, updated_at = datetime('now') WHERE id = :id`;
      try {
        db.prepare(sql).run({ id, ...Object.fromEntries(cols.map((c) => [c, sqlValue(prepared[c])])) });
      } catch (error) {
        friendlySqlError(error, spec.noun);
      }
      const after = mustGetRaw(id);
      const changes = diff(before, after);
      if (Object.keys(changes).length > 0) logActivity(db, actor, spec.entity, id, "update", spec.label(after), changes);
    }
    return get(id)!;
  };

  const remove = (actor: Actor, id: number) => {
    const before = mustGetRaw(id);
    try {
      db.prepare(`DELETE FROM ${spec.table} WHERE id = :id`).run({ id });
    } catch (error) {
      friendlySqlError(error, spec.noun);
    }
    logActivity(db, actor, spec.entity, id, "delete", spec.label(before), before);
  };

  const list = (query: Row & { q?: string; limit: number; offset: number }) => {
    const where: Where = spec.where ? spec.where(query as never) : { clauses: [], params: {} };
    const clauses = [...where.clauses];
    const params: Params = { ...where.params };
    if (query.q) {
      clauses.push(`(${spec.search.map((c) => `unaccent(${c}) LIKE unaccent(:q)`).join(" OR ")})`);
      params.q = `%${query.q}%`;
    }
    const whereSql = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (${base}${whereSql})`, params)!.n);
    const rows = all(db, `${base}${whereSql} ORDER BY ${spec.orderBy} LIMIT :limit OFFSET :offset`, {
      ...params,
      limit: query.limit,
      offset: query.offset,
    });
    return { results: rows.map(spec.present), total, limit: query.limit, offset: query.offset };
  };

  return { get, list, create, update, remove };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Déclare les routes REST d'une ressource, documentées dans la spec OpenAPI. */
export function registerResource(app: OpenAPIHono<AppEnv>, spec: ResourceSpec) {
  const repo = (db: DatabaseSync) => makeRepository(db, spec);
  const Output = spec.output;
  const Input = spec.input;
  const Patch = spec.input.partial();
  const List = z.object({
    results: z.array(Output),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  });
  const Query = z
    .object({
      q: z.string().optional().openapi({ description: "Recherche plein texte (sans tenir compte des accents)" }),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .extend(spec.filters?.shape ?? {});
  const tags = [spec.tag];
  const P = spec.path;

  app.openapi(
    createRoute({
      method: "get",
      path: `/${P}`,
      tags,
      operationId: `list_${P}`,
      summary: `Lister (${spec.tag})`,
      description: spec.description,
      request: { query: Query },
      responses: { 200: json(List, "Page de résultats"), 400: errors[400], 401: errors[401] },
    }),
    (c) => c.json(repo(c.var.db).list(c.req.valid("query") as never) as never, 200),
  );

  const BatchCreate = z.object({ items: z.array(Input).min(1).max(BATCH_MAX) });
  const BatchUpdate = z.object({
    items: z.array(Patch.extend({ id: z.number().int().positive() })).min(1).max(BATCH_MAX),
  });
  const BatchResult = z.object({ results: z.array(Output) });

  app.openapi(
    createRoute({
      method: "post",
      path: `/${P}/batch`,
      tags,
      operationId: `create_${P}_batch`,
      summary: `Créer jusqu'à ${BATCH_MAX} éléments`,
      description: "Tout ou rien : si un élément est refusé, aucun n'est créé et l'erreur indique son rang.",
      request: { body: { ...json(BatchCreate, "Éléments à créer"), required: true } },
      responses: { 201: json(BatchResult, "Éléments créés"), 400: errors[400], 401: errors[401] },
    }),
    (c) => {
      const db = c.var.db;
      const { items } = c.req.valid("json");
      const results = transaction(db, () =>
        items.map((item, index) => withIndex(index, () => repo(db).create(c.var.actor, item as Row))),
      );
      return c.json({ results } as never, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: `/${P}/batch`,
      tags,
      operationId: `update_${P}_batch`,
      summary: `Modifier jusqu'à ${BATCH_MAX} éléments`,
      description: "Tout ou rien : chaque élément porte son `id` et les seuls champs à modifier.",
      request: { body: { ...json(BatchUpdate, "Modifications"), required: true } },
      responses: { 200: json(BatchResult, "Éléments modifiés"), 400: errors[400], 401: errors[401], 404: errors[404] },
    }),
    (c) => {
      const db = c.var.db;
      const { items } = c.req.valid("json");
      const results = transaction(db, () =>
        items.map(({ id, ...patch }, index) => withIndex(index, () => repo(db).update(c.var.actor, id, patch as Row))),
      );
      return c.json({ results } as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: `/${P}/{id}`,
      tags,
      operationId: `get_${P}`,
      summary: `Lire ${spec.noun}`,
      request: { params: IdParam },
      responses: { 200: json(Output, "L'élément, valeurs calculées comprises"), 401: errors[401], 404: errors[404] },
    }),
    (c) => {
      const { id } = c.req.valid("param");
      const item = repo(c.var.db).get(id);
      if (!item) return c.json({ error: `${capitalize(spec.noun)} n° ${id} est introuvable.` }, 404);
      return c.json(item as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `/${P}`,
      tags,
      operationId: `create_${P}`,
      summary: `Créer ${spec.noun}`,
      request: { body: { ...json(Input, "Champs de l'élément"), required: true } },
      responses: { 201: json(Output, "Élément créé"), 400: errors[400], 401: errors[401] },
    }),
    (c) => {
      const db = c.var.db;
      const item = transaction(db, () => repo(db).create(c.var.actor, c.req.valid("json") as Row));
      return c.json(item as never, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: `/${P}/{id}`,
      tags,
      operationId: `update_${P}`,
      summary: `Modifier ${spec.noun}`,
      description: "Seuls les champs envoyés sont modifiés ; `null` efface une valeur.",
      request: { params: IdParam, body: { ...json(Patch, "Champs à modifier"), required: true } },
      responses: { 200: json(Output, "Élément modifié"), 400: errors[400], 401: errors[401], 404: errors[404] },
    }),
    (c) => {
      const db = c.var.db;
      const { id } = c.req.valid("param");
      const item = transaction(db, () => repo(db).update(c.var.actor, id, c.req.valid("json") as Row));
      return c.json(item as never, 200);
    },
  );

  if (spec.deletable !== false) {
    app.openapi(
      createRoute({
        method: "delete",
        path: `/${P}/{id}`,
        tags,
        operationId: `delete_${P}`,
        summary: `Supprimer ${spec.noun}`,
        description: "Suppression définitive (conservée dans le journal d'activité).",
        request: { params: IdParam },
        responses: { 204: { description: "Supprimé" }, 401: errors[401], 404: errors[404] },
      }),
      (c) => {
        const db = c.var.db;
        const { id } = c.req.valid("param");
        transaction(db, () => repo(db).remove(c.var.actor, id));
        return c.body(null, 204);
      },
    );
  }

}

function withIndex<T>(index: number, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(error.status, `Élément ${index} : ${error.message}`);
    throw error;
  }
}

// ---------- Briques de schémas partagées ----------

export const isoDate = z.iso.date().openapi({ example: "2026-10-23", description: "Date au format AAAA-MM-JJ" });
export const optionalText = z.string().trim().max(4000).nullable().optional();
export const optionalDate = isoDate.nullable().optional();
export const optionalAmount = z.number().int().min(0).nullable().optional().openapi({ description: "Montant en FCFA" });
export const priority = z.enum(["P1", "P2", "P3"]).nullable().optional();
export const timestamps = { id: z.number().int(), created_at: z.string(), updated_at: z.string() };

/** Filtre « égal à » optionnel sur une colonne. */
export function eq(where: Where, column: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  const key = column.replace(/\W/g, "_");
  where.clauses.push(`${column} = :${key}`);
  where.params[key] = sqlValue(value);
}
