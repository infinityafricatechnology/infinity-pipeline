/**
 * Espace IAP (Infinity Africa Properties) : affaires immobilières, commissions, plan d'actions, contacts.
 * Toutes les routes sont sous `/iap/…` ; l'accès est contrôlé par `requireSpaces` (auth.ts).
 */
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../auth.ts";
import { all, one, type Row } from "../db.ts";
import { actionComputed, addDays, today } from "../domain.ts";
import {
  COMMISSION_POLICY,
  IAP_LISTS,
  IAP_OPEN_STAGES,
  IAP_REVIEW_TODO,
  IAP_STAGE_CODES,
  IAP_STAGES,
  IAP_WON_STAGE,
  iapDealComputed,
  normalizeIapStage,
} from "../domain-iap.ts";
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

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const sum = (values: (number | null | undefined)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
const openList = `(${IAP_OPEN_STAGES.map((s) => `'${s}'`).join(",")})`;

const isReviewTodo = (v: unknown) => (IAP_REVIEW_TODO as readonly unknown[]).includes(v);

function nextNumber(db: DatabaseSync, table: string): number {
  return Number(one<{ n: number }>(db, `SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${table}`)!.n);
}

const stage = z.preprocess(normalizeIapStage, z.enum(IAP_STAGE_CODES)).openapi({
  description: "Étape : P0 Mandat à signer, P1 Mandat signé, P2 Présenté / visites, P3 Offre / négociation, P4 Acompte / compromis, P5 Conclu, LOST Perdu. Le libellé est aussi accepté.",
  example: "P1",
});
const person = optionalText.openapi({ description: "Nom du commercial ou de l'apporteur d'affaires" });

// ---------- Affaires ----------

const dealInput = z
  .object({
    title: z.string().trim().min(1).openapi({ description: "Bien ou projet, ex. « Villa 800m² 7ème tranche »" }),
    nature: optionalText.openapi({ description: "Vente bien immobilier, Vente de terrain, Mandat de recherche, Mandat de gestion, Location, Construction…" }),
    apporteur: person.openapi({ description: "Personne qui a apporté l'affaire (part apport : 5 %)" }),
    closeur: person.openapi({ description: "Personne qui conclut l'affaire (part closing : 10 % ; 15 % si c'est aussi l'apporteur)" }),
    client: optionalText.openapi({ description: "Acquéreur ou locataire" }),
    owner: optionalText.openapi({ description: "Propriétaire du bien" }),
    partner: optionalText.openapi({ description: "Agence partenaire ou apporteur du client" }),
    stage: stage.optional(),
    closing: z.number().min(0).max(1).nullable().optional().openapi({ description: "Probabilité de conclusion, entre 0 et 1" }),
    amount: optionalAmount.openapi({ description: "Prix du bien ou montant de l'affaire, en FCFA" }),
    commission_rate: z.number().min(0).max(1).nullable().optional().openapi({ description: "Taux de commission d'IAP, entre 0 et 1 (0.025 = 2,5 %)" }),
    due_date: optionalDate.openapi({ description: "Date de closing estimée" }),
    next_step: optionalText,
    comments: optionalText,
    commission_received: optionalAmount.openapi({ description: "Commission effectivement perçue par IAP (base de calcul des parts)" }),
    received_at: optionalDate.openapi({ description: "Date d'encaissement de la commission par IAP" }),
    apport_paid_at: optionalDate.openapi({ description: "Date de versement de la part apport (ou de la part unique de 15 %)" }),
    closing_paid_at: optionalDate.openapi({ description: "Date de versement de la part closing" }),
    priority: z.number().int().positive().nullable().optional().openapi({ description: "Rang de priorité (1 = la plus prioritaire, ex. projet Silver)" }),
    ease: z.enum(IAP_LISTS.eases).nullable().optional().openapi({ description: "Facilité de commercialisation : Élevée, Moyenne ou Faible" }),
    status_label: optionalText.openapi({ description: "Statut tel que suivi par l'équipe : Signé, Commercialisation active, Recherche active, Gestion locative…" }),
    due_diligence: optionalText.openapi({ description: "Due diligence (vérification des documents) : Nécessaire, En cours, Fait, N/A, À définir" }),
    market_study: optionalText.openapi({ description: "Étude du marché (rapport qualité / prix) : Nécessaire, En cours, Fait, N/A, À définir" }),
  })
  .openapi("IapDealInput");

const Share = z
  .object({
    person: z.string(),
    role: z.enum(["apport", "closing", "apport_closing"]),
    rate: z.number(),
    amount: z.number(),
    paid: z.boolean(),
    paid_at: z.string().nullable(),
    status: z.enum(["paid", "due", "expected"]),
  })
  .openapi("IapCommissionShare");

export const iapDealSpec: ResourceSpec = {
  entity: "iap_deal",
  path: "iap/deals",
  table: "iap_deals",
  tag: "IAP · Affaires",
  noun: "l'affaire IAP",
  description:
    "Pipeline immobilier d'IAP. Commission = montant × taux ; pondéré = × closing. Les parts (apport 5 %, closing 10 %, 15 % si même personne) se calculent sur la commission perçue, à défaut sur la commission attendue (estimation).",
  input: dealInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }),
  output: dealInput
    .extend({
      ...timestamps,
      number: z.number().int(),
      stage: z.string(),
      stage_label: z.string().nullable(),
      commission: z.number().nullable(),
      weighted_amount: z.number().nullable(),
      weighted_commission: z.number().nullable(),
      is_open: z.boolean(),
      days_to_due: z.number().nullable(),
      overdue: z.boolean(),
      commission_base: z.number().nullable(),
      commission_estimated: z.boolean(),
      shares: z.array(Share),
    })
    .openapi("IapDeal"),
  filters: z.object({
    number: z.coerce.number().int().optional().openapi({ description: "Numéro de l'affaire" }),
    stage: stage.optional(),
    nature: z.string().optional(),
    apporteur: z.string().optional(),
    closeur: z.string().optional(),
    person: z.string().optional().openapi({ description: "Affaires où cette personne est apporteur ou closeur" }),
    open: bool.optional().openapi({ description: "true : affaires en cours (P0 à P4)" }),
    due_before: isoDate.optional(),
    ease: z.enum(IAP_LISTS.eases).optional().openapi({ description: "Facilité de commercialisation" }),
    diligence: z.enum(["todo"]).optional().openapi({ description: "todo : due diligence ou étude du marché encore à mener (Nécessaire, En cours, À définir)" }),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} as Record<string, string | number> };
    eq(w, "t.number", q.number);
    eq(w, "t.stage", q.stage);
    eq(w, "t.ease", q.ease);
    if (q.diligence === "todo") {
      const todo = `(${IAP_REVIEW_TODO.map((v) => `'${v}'`).join(",")})`;
      w.clauses.push(`(t.due_diligence IN ${todo} OR t.market_study IN ${todo})`);
    }
    eq(w, "t.nature", q.nature);
    eq(w, "t.apporteur", q.apporteur);
    eq(w, "t.closeur", q.closeur);
    if (q.person) {
      w.clauses.push("(t.apporteur = :person OR t.closeur = :person)");
      w.params.person = String(q.person);
    }
    if (q.open !== undefined) w.clauses.push(`t.stage ${q.open ? "" : "NOT "}IN ${openList}`);
    if (q.due_before) {
      w.clauses.push("t.due_date <= :due_before");
      w.params.due_before = String(q.due_before);
    }
    return w;
  },
  search: ["t.title", "t.nature", "t.apporteur", "t.closeur", "t.client", "t.owner", "t.partner", "t.next_step", "t.comments", "t.status_label"],
  orderBy: "t.priority IS NULL, t.priority, t.number",
  present: (r) => ({ ...r, ...iapDealComputed(r as never) }),
  label: (r) => `#${r.number} ${r.title}`,
  prepare: (db, data, existing) => {
    if (existing || data.number) return data;
    return { stage: "P0", ...data, number: nextNumber(db, "iap_deals") };
  },
};

// ---------- Contacts ----------

const contactInput = z
  .object({
    name: z.string().trim().min(1),
    role: optionalText.openapi({ description: "Acquéreur, Locataire, Propriétaire, Agence partenaire, Apporteur d'affaires, Autre" }),
    company: optionalText,
    phone: optionalText,
    email: z.string().trim().max(320).nullable().optional(),
    notes: optionalText,
  })
  .openapi("IapContactInput");

export const iapContactSpec: ResourceSpec = {
  entity: "iap_contact",
  path: "iap/contacts",
  table: "iap_contacts",
  tag: "IAP · Contacts",
  noun: "le contact IAP",
  description: "Acquéreurs, locataires, propriétaires, agences partenaires et apporteurs d'IAP.",
  input: contactInput,
  output: contactInput.extend(timestamps).openapi("IapContact"),
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

// ---------- Plan d'actions ----------

const actionInput = z
  .object({
    title: z.string().trim().min(1),
    deal_id: z.number().int().positive().nullable().optional().openapi({ description: "Affaire IAP concernée (identifiant, pas le numéro)" }),
    owner: optionalText,
    due_date: optionalDate,
    priority,
    status: z.enum(IAP_LISTS.action_statuses).optional(),
    comments: optionalText,
  })
  .openapi("IapActionInput");

export const iapActionSpec: ResourceSpec = {
  entity: "iap_action",
  path: "iap/actions",
  table: "iap_actions",
  tag: "IAP · Plan d'actions",
  noun: "l'action IAP",
  description: "Relances et prochaines étapes d'IAP. En retard si l'échéance est passée et l'action ni faite ni abandonnée.",
  input: actionInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }),
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
    .openapi("IapAction"),
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
  select: "SELECT t.*, d.number AS deal_number, d.title AS deal_title FROM iap_actions t LEFT JOIN iap_deals d ON d.id = t.deal_id",
  present: (r) => ({ ...r, ...actionComputed(r as never) }),
  label: (r) => `Action ${r.number} : ${r.title}`,
  prepare: (db, data, existing) => (existing || data.number ? data : { ...data, number: nextNumber(db, "iap_actions") }),
};

export const IAP_SPECS = [iapDealSpec, iapActionSpec, iapContactSpec];

// ---------- Synthèses ----------

type Deal = Row & ReturnType<typeof iapDealComputed> & { number: number; title: string; stage: string; amount: number | null; apporteur: string | null; closeur: string | null; commission_received: number | null };

export function loadIapDeals(db: DatabaseSync): Deal[] {
  return all(db, "SELECT * FROM iap_deals ORDER BY priority IS NULL, priority, number").map((r) => iapDealSpec.present(r) as Deal);
}

export function buildIapSummary(db: DatabaseSync) {
  const deals = loadIapDeals(db);
  const actions = all<{ due_date: string | null; status: string }>(db, "SELECT due_date, status FROM iap_actions").map((a) => actionComputed(a));
  const open = deals.filter((d) => d.is_open);
  const totals = (items: Deal[]) => ({
    count: items.length,
    amount: sum(items.map((d) => d.amount)),
    weighted_amount: sum(items.map((d) => d.weighted_amount)),
    commission: sum(items.map((d) => d.commission)),
    weighted_commission: sum(items.map((d) => d.weighted_commission)),
  });
  const shares = deals.flatMap((d) => d.shares);
  const people = [...new Set(deals.flatMap((d) => [d.apporteur ?? "Non renseigné"]))];
  return {
    as_of: today(),
    pipeline: {
      deals_count: deals.length,
      open_count: open.length,
      total_amount: sum(deals.map((d) => d.amount)),
      open_amount: sum(open.map((d) => d.amount)),
      weighted_amount: sum(open.map((d) => d.weighted_amount)),
      commission: sum(deals.map((d) => d.commission)),
      open_commission: sum(open.map((d) => d.commission)),
      weighted_commission: sum(open.map((d) => d.weighted_commission)),
      won_count: deals.filter((d) => d.stage === IAP_WON_STAGE).length,
      won_amount: sum(deals.filter((d) => d.stage === IAP_WON_STAGE).map((d) => d.amount)),
      commission_received: sum(deals.map((d) => d.commission_received)),
      mandates_signed_count: deals.filter((d) => d.stage !== "P0" && d.stage !== "LOST").length,
      to_sign_count: deals.filter((d) => d.stage === "P0").length,
      diligence_todo_count: open.filter((d) => isReviewTodo(d.due_diligence) || isReviewTodo(d.market_study)).length,
      open_actions_count: actions.filter((a) => !a.done).length,
      overdue_actions_count: actions.filter((a) => a.overdue).length,
    },
    commissions: {
      due: sum(shares.filter((s) => s.status === "due").map((s) => s.amount)),
      paid: sum(shares.filter((s) => s.status === "paid").map((s) => s.amount)),
      expected: sum(shares.filter((s) => s.status === "expected").map((s) => s.amount)),
    },
    by_stage: IAP_STAGES.map((s) => ({ key: s.code, label: s.label, short: s.short, ...totals(deals.filter((d) => d.stage === s.code)) })),
    by_person: people
      .map((p) => ({ key: p, ...totals(open.filter((d) => (d.apporteur ?? "Non renseigné") === p)), all_count: deals.filter((d) => (d.apporteur ?? "Non renseigné") === p).length }))
      .sort((a, b) => b.amount - a.amount),
    contacts_count: Number(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM iap_contacts")!.n),
  };
}

export function buildIapAgenda(db: DatabaseSync, days: number) {
  const now = today();
  const horizon = addDays(now, days);
  const actions = all(db, `${iapActionSpec.select} WHERE t.status NOT IN ('Fait', 'Abandonné') AND t.due_date <= :horizon ORDER BY t.due_date, t.priority`, { horizon }).map(
    (r) => iapActionSpec.present(r),
  );
  const deals = all(db, `SELECT * FROM iap_deals WHERE due_date <= :horizon AND stage IN ${openList} ORDER BY due_date, priority IS NULL, priority`, { horizon }).map((r) => iapDealSpec.present(r));
  return { as_of: now, horizon, actions, deals };
}

/** Une ligne par part de commission, et le total par bénéficiaire. */
export function buildIapCommissions(db: DatabaseSync, filters: { person?: string; status?: string }) {
  const rows = loadIapDeals(db)
    .filter((d) => d.stage !== "LOST")
    .flatMap((d) =>
      d.shares.map((s) => ({
        ...s,
        deal_id: d.id as number,
        deal_number: d.number,
        deal_title: d.title,
        stage: d.stage,
        stage_label: d.stage_label,
        base: d.commission_base,
        estimated: d.commission_estimated,
      })),
    )
    .filter((r) => (!filters.person || r.person === filters.person) && (!filters.status || r.status === filters.status));
  const people = [...new Set(rows.map((r) => r.person))].sort((a, b) => a.localeCompare(b, "fr"));
  const total = (items: typeof rows) => ({
    apport: sum(items.filter((r) => r.role === "apport").map((r) => r.amount)),
    closing: sum(items.filter((r) => r.role === "closing").map((r) => r.amount)),
    combined: sum(items.filter((r) => r.role === "apport_closing").map((r) => r.amount)),
    total: sum(items.map((r) => r.amount)),
    paid: sum(items.filter((r) => r.status === "paid").map((r) => r.amount)),
    due: sum(items.filter((r) => r.status === "due").map((r) => r.amount)),
    expected: sum(items.filter((r) => r.status === "expected").map((r) => r.amount)),
  });
  return {
    policy: COMMISSION_POLICY,
    people: people.map((p) => {
      const own = rows.filter((r) => r.person === p);
      return { person: p, deals_count: new Set(own.map((r) => r.deal_id)).size, ...total(own) };
    }),
    totals: total(rows),
    results: rows,
  };
}

export function registerIap(app: OpenAPIHono<AppEnv>) {
  for (const spec of IAP_SPECS) registerResource(app, spec);
  const tags = ["IAP · Synthèse"];
  const Obj = (name: string) => z.record(z.string(), z.unknown()).openapi(name);

  app.openapi(
    createRoute({
      method: "get",
      path: "/iap/summary",
      tags,
      operationId: "get_iap_summary",
      summary: "Synthèse du pipeline IAP",
      description: "Portefeuille, pondéré, commissions attendues / perçues, parts à verser, répartition par étape et par commercial.",
      responses: { 200: json(Obj("IapSummary"), "Synthèse") },
    }),
    (c) => c.json(buildIapSummary(c.var.db), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/iap/agenda",
      tags,
      operationId: "get_iap_agenda",
      summary: "IAP : à traiter prochainement",
      description: "Actions IAP non faites dont l'échéance tombe dans la période (retards compris) et affaires en cours dont le closing estimé arrive.",
      request: { query: z.object({ days: z.coerce.number().int().min(0).max(365).default(7) }) },
      responses: { 200: json(Obj("IapAgenda"), "Éléments à traiter") },
    }),
    (c) => c.json(buildIapAgenda(c.var.db, c.req.valid("query").days), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/iap/commissions",
      tags,
      operationId: "get_iap_commissions",
      summary: "Commissions des commerciaux et apporteurs",
      description:
        "Parts de commission par affaire et total par bénéficiaire. Statut : paid (versée), due (IAP a perçu sa commission, part à verser), expected (estimation sur la commission attendue).",
      request: {
        query: z.object({
          person: z.string().optional(),
          status: z.enum(["paid", "due", "expected"]).optional(),
        }),
      },
      responses: { 200: json(Obj("IapCommissions"), "Commissions") },
    }),
    (c) => c.json(buildIapCommissions(c.var.db, c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/iap/lists",
      tags,
      operationId: "get_iap_lists",
      summary: "IAP : valeurs admises",
      description: "Étapes, natures, commerciaux, rôles de contact, statuts d'action et politique de commissionnement.",
      responses: { 200: json(Obj("IapLists"), "Listes de valeurs") },
    }),
    (c) => c.json(IAP_LISTS as never, 200),
  );
}
