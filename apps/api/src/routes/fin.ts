/**
 * Espaces IAC (mobilisation de capitaux) et IAF (financement) : affaires, encaissements, plan d'actions,
 * contacts. Les deux filiales partagent ce module ; chacune a ses tables (`iac_*`, `iaf_*`) et ses routes
 * (`/iac/…`, `/iaf/…`), dont l'accès est contrôlé par `requireSpaces` (auth.ts).
 */
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync } from "node:sqlite";
import type { Entity } from "../activity.ts";
import type { AppEnv } from "../auth.ts";
import { all, one, type Row } from "../db.ts";
import { actionComputed, addDays, today } from "../domain.ts";
import {
  FIN_LISTS,
  FIN_OPEN_STAGES,
  FIN_SPACE_INFO,
  FIN_STAGE_CODES,
  FIN_STAGES,
  finDealComputed,
  normalizeFinStage,
} from "../domain-fin.ts";
import {
  eq,
  isoDate,
  optionalAmount,
  optionalDate,
  optionalText,
  priority,
  registerResource,
  type ResourceSpec,
  timestamps,
} from "../resource.ts";
import { FIN_SPACES, type FinSpace } from "../spaces.ts";

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const sum = (values: (number | null | undefined)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
const openList = `(${FIN_OPEN_STAGES.map((s) => `'${s}'`).join(",")})`;

function nextNumber(db: DatabaseSync, table: string): number {
  return Number(one<{ n: number }>(db, `SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${table}`)!.n);
}

const stage = z.preprocess(normalizeFinStage, z.enum(FIN_STAGE_CODES)).openapi({
  description:
    "Étape : F0 Prospection, F1 Étude de faisabilité / documents, F2 Mandat signé, F3 Structuration / dossier transmis, F4 Financement obtenu, à recouvrer, F5 Encaissé, LOST Perdu. Le libellé est aussi accepté.",
  example: "F1",
});

const dealInput = z.object({
  title: z.string().trim().min(1).openapi({ description: "Entreprise ou projet, ex. « HYBA ENTREPRISE »" }),
  nature: optionalText.openapi({ description: "Mobilisation de capitaux, Levée de fonds Dette, Levée de fonds Equity, Leasing, Restructuration…" }),
  sector: optionalText.openapi({ description: "Domaine d'activité du client : Santé, Énergie, Hydrocarbures, Microfinance…" }),
  owner: optionalText.openapi({ description: "Responsable de l'affaire" }),
  apporteur: optionalText.openapi({ description: "Personne ou partenaire qui a apporté l'affaire" }),
  stage: stage.optional(),
  closing: z.number().min(0).max(1).nullable().optional().openapi({ description: "Probabilité de closing, entre 0 et 1" }),
  due_date: optionalDate.openapi({ description: "Date de closing estimée" }),
  amount: optionalAmount.openapi({ description: "Montant de la demande (capitaux ou financement recherchés), en FCFA" }),
  fee: optionalAmount.openapi({ description: "Honoraire forfaitaire facturé au client (étude, structuration), en FCFA" }),
  fee_received: optionalAmount.openapi({ description: "Part de l'honoraire déjà encaissée" }),
  fee_received_at: optionalDate.openapi({ description: "Date du dernier encaissement d'honoraire" }),
  commission_rate: z.number().min(0).max(1).nullable().optional().openapi({ description: "Taux de la commission de succès, entre 0 et 1 (0.025 = 2,5 %)" }),
  commission_received: optionalAmount.openapi({ description: "Commission de succès déjà encaissée" }),
  commission_received_at: optionalDate.openapi({ description: "Date du dernier encaissement de commission" }),
  priority: z.number().int().positive().nullable().optional().openapi({ description: "Rang de priorité (1 = la plus prioritaire)" }),
  next_step: optionalText,
  comments: optionalText,
});

const contactInput = z.object({
  name: z.string().trim().min(1),
  role: optionalText.openapi({ description: "Dirigeant client, Banque / bailleur, Investisseur, Partenaire, Conseil, Autre" }),
  company: optionalText,
  phone: optionalText,
  email: z.string().trim().max(320).nullable().optional(),
  notes: optionalText,
});

/** Les trois ressources (affaires, actions, contacts) d'une filiale IAC ou IAF. */
export function finSpecs(space: FinSpace) {
  const { name } = FIN_SPACE_INFO[space];
  const N = name.charAt(0) + name.slice(1).toLowerCase(); // « Iac », pour les noms de schémas OpenAPI
  const deals = `${space}_deals`;
  const actions = `${space}_actions`;

  const dealSpec: ResourceSpec = {
    entity: `${space}_deal` as Entity,
    path: `${space}/deals`,
    table: deals,
    tag: `${name} · Affaires`,
    noun: `l'affaire ${name}`,
    description: `Pipeline ${name} (${FIN_SPACE_INFO[space].activity}). Revenus : honoraire + commission de succès (montant × taux). Pondéré = × closing. Reste à encaisser : honoraire non encaissé (sauf affaire perdue) et, une fois le financement obtenu (F4, F5), commission non encaissée.`,
    input: dealInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }).openapi(`${N}DealInput`),
    output: dealInput
      .extend({
        ...timestamps,
        number: z.number().int(),
        stage: z.string(),
        stage_label: z.string().nullable(),
        commission: z.number().nullable(),
        revenue: z.number().nullable(),
        weighted_amount: z.number().nullable(),
        weighted_commission: z.number().nullable(),
        weighted_revenue: z.number().nullable(),
        received: z.number(),
        fee_outstanding: z.number(),
        commission_outstanding: z.number(),
        outstanding: z.number(),
        is_open: z.boolean(),
        is_won: z.boolean(),
        days_to_due: z.number().nullable(),
        overdue: z.boolean(),
      })
      .openapi(`${N}Deal`),
    filters: z.object({
      number: z.coerce.number().int().optional().openapi({ description: "Numéro de l'affaire" }),
      stage: stage.optional(),
      nature: z.string().optional(),
      sector: z.string().optional(),
      owner: z.string().optional(),
      open: bool.optional().openapi({ description: "true : affaires en cours (F0 à F4)" }),
      outstanding: bool.optional().openapi({ description: "true : affaires avec un honoraire ou une commission à encaisser" }),
      due_before: isoDate.optional(),
    }),
    where: (q: Row) => {
      const w = { clauses: [] as string[], params: {} as Record<string, string | number> };
      eq(w, "t.number", q.number);
      eq(w, "t.stage", q.stage);
      eq(w, "t.nature", q.nature);
      eq(w, "t.sector", q.sector);
      eq(w, "t.owner", q.owner);
      if (q.open !== undefined) w.clauses.push(`t.stage ${q.open ? "" : "NOT "}IN ${openList}`);
      if (q.outstanding) {
        w.clauses.push(
          `((t.fee IS NOT NULL AND t.stage <> 'LOST' AND t.fee > COALESCE(t.fee_received, 0))
            OR (t.stage IN ('F4', 'F5') AND t.amount IS NOT NULL AND t.commission_rate IS NOT NULL
                AND ROUND(t.amount * t.commission_rate) > COALESCE(t.commission_received, 0)))`,
        );
      }
      if (q.due_before) {
        w.clauses.push("t.due_date <= :due_before");
        w.params.due_before = String(q.due_before);
      }
      return w;
    },
    search: ["t.title", "t.nature", "t.sector", "t.owner", "t.apporteur", "t.next_step", "t.comments"],
    orderBy: "t.priority IS NULL, t.priority, t.number",
    present: (r) => ({ ...r, ...finDealComputed(r as never) }),
    label: (r) => `#${r.number} ${r.title}`,
    prepare: (db, data, existing) => {
      if (existing || data.number) return data;
      return { stage: "F0", ...data, number: nextNumber(db, deals) };
    },
  };

  const contactSpec: ResourceSpec = {
    entity: `${space}_contact` as Entity,
    path: `${space}/contacts`,
    table: `${space}_contacts`,
    tag: `${name} · Contacts`,
    noun: `le contact ${name}`,
    description: `Dirigeants clients, banques, investisseurs et partenaires d'${name}.`,
    input: contactInput.openapi(`${N}ContactInput`),
    output: contactInput.extend(timestamps).openapi(`${N}Contact`),
    filters: z.object({ role: z.string().optional() }),
    where: (q: Row) => {
      const w = { clauses: [] as string[], params: {} };
      eq(w, "t.role", q.role);
      return w;
    },
    search: ["t.name", "t.company", "t.role", "t.email", "t.phone", "t.notes"],
    orderBy: "t.name COLLATE NOCASE",
    present: (r) => r,
    label: (r) => `${r.name}${r.company ? ` (${r.company})` : ""}`,
  };

  const actionInput = z.object({
    title: z.string().trim().min(1),
    deal_id: z.number().int().positive().nullable().optional().openapi({ description: `Affaire ${name} concernée (identifiant, pas le numéro)` }),
    owner: optionalText,
    due_date: optionalDate,
    priority,
    status: z.enum(FIN_LISTS.action_statuses).optional(),
    comments: optionalText,
  });

  const actionSpec: ResourceSpec = {
    entity: `${space}_action` as Entity,
    path: `${space}/actions`,
    table: actions,
    tag: `${name} · Plan d'actions`,
    noun: `l'action ${name}`,
    description: `Relances et prochaines étapes d'${name}. En retard si l'échéance est passée et l'action ni faite ni abandonnée.`,
    input: actionInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }).openapi(`${N}ActionInput`),
    output: actionInput
      .extend({
        ...timestamps,
        number: z.number().int(),
        deal_number: z.number().int().nullable(),
        deal_title: z.string().nullable(),
        done: z.boolean(),
        overdue: z.boolean(),
        days_to_due: z.number().nullable(),
      })
      .openapi(`${N}Action`),
    filters: z.object({
      number: z.coerce.number().int().optional(),
      status: z.string().optional(),
      owner: z.string().optional(),
      priority: z.enum(["P1", "P2", "P3"]).optional(),
      deal_id: z.coerce.number().int().optional(),
      open: bool.optional().openapi({ description: "true : actions ni faites ni abandonnées" }),
      overdue: bool.optional(),
      due_before: isoDate.optional(),
    }),
    where: (q: Row) => {
      const w = { clauses: [] as string[], params: {} as Record<string, string | number> };
      eq(w, "t.number", q.number);
      eq(w, "t.status", q.status);
      eq(w, "t.owner", q.owner);
      eq(w, "t.priority", q.priority);
      eq(w, "t.deal_id", q.deal_id);
      if (q.open !== undefined) w.clauses.push(`t.status ${q.open ? "NOT " : ""}IN ('Fait', 'Abandonné')`);
      if (q.overdue) {
        w.clauses.push("t.status NOT IN ('Fait', 'Abandonné') AND t.due_date < :today");
        w.params.today = today();
      }
      if (q.due_before) {
        w.clauses.push("t.due_date <= :due_before");
        w.params.due_before = String(q.due_before);
      }
      return w;
    },
    search: ["t.title", "t.owner", "t.comments", "d.title"],
    orderBy: "t.status IN ('Fait', 'Abandonné'), COALESCE(t.due_date, '9999'), t.priority, t.number",
    select: `SELECT t.*, d.number AS deal_number, d.title AS deal_title FROM ${actions} t LEFT JOIN ${deals} d ON d.id = t.deal_id`,
    present: (r) => ({ ...r, ...actionComputed(r as never) }),
    label: (r) => `Action ${r.number} : ${r.title}`,
    prepare: (db, data, existing) => (existing || data.number ? data : { ...data, number: nextNumber(db, actions) }),
  };

  return { dealSpec, actionSpec, contactSpec };
}

// ---------- Synthèses ----------

type Deal = Row &
  ReturnType<typeof finDealComputed> & {
    id: number;
    number: number;
    title: string;
    stage: string;
    amount: number | null;
    fee: number | null;
    fee_received: number | null;
    commission_received: number | null;
    owner: string | null;
    sector: string | null;
    nature: string | null;
    due_date: string | null;
  };

export function loadFinDeals(db: DatabaseSync, space: FinSpace): Deal[] {
  const { dealSpec } = finSpecs(space);
  return all(db, `SELECT * FROM ${space}_deals ORDER BY priority IS NULL, priority, number`).map((r) => dealSpec.present(r) as Deal);
}

export function buildFinSummary(db: DatabaseSync, space: FinSpace) {
  const deals = loadFinDeals(db, space);
  const actions = all<{ due_date: string | null; status: string }>(db, `SELECT due_date, status FROM ${space}_actions`).map((a) => actionComputed(a));
  const open = deals.filter((d) => d.is_open);
  const live = deals.filter((d) => d.stage !== "LOST");
  const totals = (items: Deal[]) => ({
    count: items.length,
    amount: sum(items.map((d) => d.amount)),
    weighted_amount: sum(items.map((d) => d.weighted_amount)),
    fee: sum(items.map((d) => d.fee)),
    commission: sum(items.map((d) => d.commission)),
    weighted_revenue: sum(items.map((d) => d.weighted_revenue)),
  });
  const groupBy = (keyOf: (d: Deal) => string | null) => {
    const keys = [...new Set(open.map((d) => keyOf(d) ?? "Non renseigné"))];
    return keys.map((key) => ({ key, ...totals(open.filter((d) => (keyOf(d) ?? "Non renseigné") === key)) })).sort((a, b) => b.amount - a.amount);
  };
  return {
    as_of: today(),
    space,
    pipeline: {
      deals_count: deals.length,
      open_count: open.length,
      total_amount: sum(live.map((d) => d.amount)),
      open_amount: sum(open.map((d) => d.amount)),
      weighted_amount: sum(open.map((d) => d.weighted_amount)),
      fee: sum(live.map((d) => d.fee)),
      commission: sum(live.map((d) => d.commission)),
      revenue: sum(live.map((d) => d.revenue)),
      weighted_revenue: sum(open.map((d) => d.weighted_revenue)),
      won_count: deals.filter((d) => d.is_won).length,
      won_amount: sum(deals.filter((d) => d.is_won).map((d) => d.amount)),
      mandates_count: deals.filter((d) => ["F2", "F3", "F4", "F5"].includes(d.stage)).length,
      overdue_count: open.filter((d) => d.overdue).length,
      open_actions_count: actions.filter((a) => !a.done).length,
      overdue_actions_count: actions.filter((a) => a.overdue).length,
    },
    cash: {
      received: sum(deals.map((d) => d.received)),
      fee_received: sum(deals.map((d) => d.fee_received)),
      commission_received: sum(deals.map((d) => d.commission_received)),
      fee_outstanding: sum(deals.map((d) => d.fee_outstanding)),
      commission_outstanding: sum(deals.map((d) => d.commission_outstanding)),
      outstanding: sum(deals.map((d) => d.outstanding)),
    },
    by_stage: FIN_STAGES.map((s) => ({ key: s.code, label: s.label, short: s.short, ...totals(deals.filter((d) => d.stage === s.code)) })),
    by_sector: groupBy((d) => d.sector),
    by_nature: groupBy((d) => d.nature),
    by_owner: groupBy((d) => d.owner),
    contacts_count: Number(one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${space}_contacts`)!.n),
  };
}

export function buildFinAgenda(db: DatabaseSync, space: FinSpace, days: number) {
  const { dealSpec, actionSpec } = finSpecs(space);
  const now = today();
  const horizon = addDays(now, days);
  const actions = all(db, `${actionSpec.select} WHERE t.status NOT IN ('Fait', 'Abandonné') AND t.due_date <= :horizon ORDER BY t.due_date, t.priority`, { horizon }).map(
    (r) => actionSpec.present(r),
  );
  const deals = all(db, `SELECT * FROM ${space}_deals WHERE due_date <= :horizon AND stage IN ${openList} ORDER BY due_date, priority IS NULL, priority`, { horizon }).map((r) =>
    dealSpec.present(r),
  );
  return { as_of: now, horizon, actions, deals };
}

/** Honoraires et commissions restant à encaisser, affaire par affaire. */
export function buildFinRecovery(db: DatabaseSync, space: FinSpace) {
  const deals = loadFinDeals(db, space);
  const rows = deals
    .filter((d) => d.outstanding > 0 || d.received > 0)
    .map((d) => ({
      deal_id: d.id,
      deal_number: d.number,
      deal_title: d.title,
      stage: d.stage,
      stage_label: d.stage_label,
      owner: d.owner,
      fee: d.fee,
      fee_received: d.fee_received ?? 0,
      fee_received_at: d.fee_received_at ?? null,
      fee_outstanding: d.fee_outstanding,
      commission: d.commission,
      commission_received: d.commission_received ?? 0,
      commission_received_at: d.commission_received_at ?? null,
      commission_outstanding: d.commission_outstanding,
      outstanding: d.outstanding,
      next_step: d.next_step ?? null,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
  return {
    totals: {
      fee_outstanding: sum(rows.map((r) => r.fee_outstanding)),
      commission_outstanding: sum(rows.map((r) => r.commission_outstanding)),
      outstanding: sum(rows.map((r) => r.outstanding)),
      received: sum(rows.map((r) => r.fee_received + r.commission_received)),
    },
    results: rows,
  };
}

function registerFinSpace(app: OpenAPIHono<AppEnv>, space: FinSpace) {
  const { dealSpec, actionSpec, contactSpec } = finSpecs(space);
  for (const spec of [dealSpec, actionSpec, contactSpec]) registerResource(app, spec);
  const { name } = FIN_SPACE_INFO[space];
  const tags = [`${name} · Synthèse`];
  const Obj = (schema: string) => z.record(z.string(), z.unknown()).openapi(`${name.charAt(0)}${name.slice(1).toLowerCase()}${schema}`);

  app.openapi(
    createRoute({
      method: "get",
      path: `/${space}/summary`,
      tags,
      operationId: `get_${space}_summary`,
      summary: `Synthèse du pipeline ${name}`,
      description: "Portefeuille, pondéré, honoraires et commissions attendus, encaissés et à recouvrer, répartition par étape, domaine, nature et responsable.",
      responses: { 200: json(Obj("Summary"), "Synthèse") },
    }),
    (c) => c.json(buildFinSummary(c.var.db, space), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: `/${space}/agenda`,
      tags,
      operationId: `get_${space}_agenda`,
      summary: `${name} : à traiter prochainement`,
      description: `Actions ${name} non faites dont l'échéance tombe dans la période (retards compris) et affaires en cours dont le closing estimé arrive.`,
      request: { query: z.object({ days: z.coerce.number().int().min(0).max(365).default(7) }) },
      responses: { 200: json(Obj("Agenda"), "Éléments à traiter") },
    }),
    (c) => c.json(buildFinAgenda(c.var.db, space, c.req.valid("query").days), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: `/${space}/recovery`,
      tags,
      operationId: `get_${space}_recovery`,
      summary: `${name} : encaissements et recouvrement`,
      description: "Honoraires et commissions de succès encaissés et restant à recouvrer, par affaire (les plus gros montants dus d'abord).",
      responses: { 200: json(Obj("Recovery"), "Encaissements") },
    }),
    (c) => c.json(buildFinRecovery(c.var.db, space), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: `/${space}/lists`,
      tags,
      operationId: `get_${space}_lists`,
      summary: `${name} : valeurs admises`,
      description: "Étapes, natures, domaines, rôles de contact, priorités et statuts d'action.",
      responses: { 200: json(Obj("Lists"), "Listes de valeurs") },
    }),
    (c) => c.json(FIN_LISTS as never, 200),
  );
}

export function registerFin(app: OpenAPIHono<AppEnv>) {
  for (const space of FIN_SPACES) registerFinSpace(app, space);
}
