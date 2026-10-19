import { type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../auth.ts";
import { one, type Row } from "../db.ts";
import {
  ACCOUNT_KINDS,
  actionComputed,
  dealComputed,
  invoiceComputed,
  LISTS,
  normalizeStage,
  OPEN_STAGES,
  renewalComputed,
  STAGE_CODES,
  stageLabel,
  tenderComputed,
} from "../domain.ts";
import {
  ApiError,
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

const stage = z.preprocess(normalizeStage, z.enum(STAGE_CODES)).openapi({
  description: "Code d'étape (M0…M6, LOST, CLOSED) ; le libellé complet du classeur est aussi accepté",
  example: "M5",
});
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
const accountRef = { account_id: z.number().int().positive().openapi({ description: "Identifiant du compte (GET /accounts)" }) };
const accountJoin = (table: string) =>
  `SELECT t.*, a.name AS account_name, a.slug AS account_slug FROM ${table} t LEFT JOIN accounts a ON a.id = t.account_id`;
const accountOut = { account_id: z.number().int().nullable(), account_name: z.string().nullable(), account_slug: z.string().nullable() };

function nextNumber(db: DatabaseSync, table: string): number {
  return Number(one<{ n: number }>(db, `SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${table}`)!.n);
}

// ---------- Comptes ----------

const accountInput = z
  .object({
    name: z.string().trim().min(1),
    display_name: optionalText,
    kind: z.enum(ACCOUNT_KINDS.map((k) => k.code) as ["client", "prospect", "tender", "partner"]),
    sector: optionalText,
    leadership_summary: optionalText.openapi({ description: "Direction générale identifiée (DG, DGA…)" }),
    contact_direction: optionalText,
    contact_operational: optionalText,
    contact_purchasing: optionalText,
    iat_lead: optionalText.openapi({ description: "Responsable IAT (lead commercial)" }),
    executive_sponsor: optionalText.openapi({ description: "Relation haut niveau gérée par" }),
    health: z.enum(LISTS.health).nullable().optional(),
    satisfaction: z.number().int().min(1).max(5).nullable().optional(),
    last_contact: optionalDate,
    next_meeting: optionalText,
    notes: optionalText,
    has_fiche: z.boolean().optional().openapi({ description: "Compte suivi avec une fiche complète" }),
  })
  .openapi("AccountInput");

export const accountSpec: ResourceSpec = {
  entity: "account",
  path: "accounts",
  table: "accounts",
  tag: "Comptes",
  noun: "le compte",
  description: "Clients, prospects, partenaires et organismes d'appels d'offres.",
  input: accountInput,
  output: accountInput
    .extend({ ...timestamps, slug: z.string(), has_fiche: z.boolean(), deals_count: z.number().int(), open_amount: z.number().int() })
    .openapi("Account"),
  filters: z.object({ kind: accountInput.shape.kind.optional(), has_fiche: bool.optional() }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.kind", q.kind);
    if (q.has_fiche !== undefined) eq(w, "t.has_fiche", q.has_fiche ? 1 : 0);
    return w;
  },
  search: ["t.name", "t.display_name", "t.sector"],
  orderBy: "t.has_fiche DESC, t.name COLLATE NOCASE",
  select: `SELECT t.*,
      (SELECT COUNT(*) FROM deals d WHERE d.account_id = t.id) AS deals_count,
      (SELECT COALESCE(SUM(d.amount), 0) FROM deals d WHERE d.account_id = t.id AND d.stage IN (${OPEN_STAGES.map((s) => `'${s}'`).join(",")})) AS open_amount
    FROM accounts t`,
  present: (r) => ({ ...r, has_fiche: Boolean(r.has_fiche) }),
  label: (r) => String(r.name),
  prepare: (_db, data, existing) => {
    if (!existing && data.name) return { ...data, slug: slugify(String(data.name)) };
    return data;
  },
  deletable: false,
};
// Le slug est calculé à la création : on l'ajoute aux colonnes écrites.
accountSpec.input = accountInput.extend({ slug: z.string().optional().openapi({ description: "Calculé depuis le nom" }) });

export function slugify(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'«»]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------- Affaires ----------

const dealInput = z
  .object({
    ...accountRef,
    title: z.string().trim().min(1).openapi({ description: "Nature de l'affaire" }),
    project_label: optionalText.openapi({ description: "Entreprise / projet tel qu'affiché dans le pipeline" }),
    solution: optionalText.openapi({ description: "Solution / partenaire" }),
    origin: optionalText,
    lead: optionalText.openapi({ description: `Responsable, ex. ${LISTS.leads.join(", ")}` }),
    recurrence: z.enum(LISTS.recurrences).nullable().optional(),
    stage,
    closing: z.number().min(0).max(1).nullable().optional().openapi({ description: "Probabilité de signature, entre 0 et 1" }),
    amount: optionalAmount,
    commission: optionalAmount,
    priority,
    next_step: optionalText,
    due_date: optionalDate,
    comments: optionalText,
    service: optionalText.openapi({ description: "Service IAT proposé" }),
    key_contact: optionalText,
  })
  .openapi("DealInput");

export const dealSpec: ResourceSpec = {
  entity: "deal",
  path: "deals",
  table: "deals",
  tag: "Affaires",
  noun: "l'affaire",
  description:
    "Le pipeline : une ligne par affaire. Montant pondéré = montant × closing ; % rentabilité = commission / montant.",
  input: dealInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }),
  output: dealInput
    .extend({
      ...timestamps,
      ...accountOut,
      account_kind: z.string().nullable(),
      number: z.number().int(),
      stage_label: z.string(),
      weighted_amount: z.number().nullable(),
      profitability: z.number().nullable(),
      is_open: z.boolean(),
      days_to_due: z.number().nullable(),
      overdue: z.boolean(),
    })
    .openapi("Deal"),
  filters: z.object({
    number: z.coerce.number().int().optional().openapi({ description: "Numéro de l'affaire, tel qu'affiché dans le pipeline" }),
    stage: stage.optional(),
    account_id: z.coerce.number().int().optional(),
    account_kind: accountInput.shape.kind.optional(),
    lead: z.string().optional(),
    priority: z.enum(["P1", "P2", "P3"]).optional(),
    open: bool.optional().openapi({ description: "true : affaires en cours (M0 à M5) seulement" }),
    due_before: isoDate.optional(),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} as Record<string, string | number> };
    eq(w, "t.number", q.number);
    eq(w, "t.stage", q.stage);
    eq(w, "t.account_id", q.account_id);
    eq(w, "a.kind", q.account_kind);
    eq(w, "t.lead", q.lead);
    eq(w, "t.priority", q.priority);
    if (q.open !== undefined) w.clauses.push(`t.stage ${q.open ? "" : "NOT "}IN (${OPEN_STAGES.map((s) => `'${s}'`).join(",")})`);
    if (q.due_before) {
      w.clauses.push("t.due_date <= :due_before");
      w.params.due_before = String(q.due_before);
    }
    return w;
  },
  search: ["t.title", "t.project_label", "t.solution", "a.name", "t.next_step", "t.comments"],
  orderBy: "t.number",
  select: `SELECT t.*, a.name AS account_name, a.slug AS account_slug, a.kind AS account_kind FROM deals t LEFT JOIN accounts a ON a.id = t.account_id`,
  present: (r) => ({ ...r, ...dealComputed(r as never) }),
  label: (r) => `#${r.number} ${r.title}`,
  prepare: (db, data, existing) => (existing || data.number ? data : { ...data, number: nextNumber(db, "deals") }),
};

// ---------- Facturation ----------

const invoiceInput = z
  .object({
    ...accountRef,
    product: z.string().trim().min(1),
    vendor: optionalText,
    recurrence: z.enum(LISTS.recurrences).nullable().optional(),
    fiscal_year: z.number().int().min(2000).max(2100).nullable().optional(),
    invoice_date: optionalDate,
    amount: optionalAmount,
    cost_of_sales: optionalAmount,
    commission: optionalAmount,
    collected: optionalAmount.openapi({ description: "Montant encaissé à ce jour" }),
    comments: optionalText,
  })
  .openapi("InvoiceInput");

export const invoiceSpec: ResourceSpec = {
  entity: "invoice",
  path: "invoices",
  table: "invoices",
  tag: "Facturation",
  noun: "la facture",
  description: "Ce qui a été vendu et facturé. CA net = montant − commission ; marge = CA net − coût des ventes ; solde = montant − encaissé.",
  input: invoiceInput,
  output: invoiceInput
    .extend({ ...timestamps, ...accountOut, net_revenue: z.number().nullable(), margin: z.number().nullable(), balance: z.number().nullable() })
    .openapi("Invoice"),
  filters: z.object({
    account_id: z.coerce.number().int().optional(),
    fiscal_year: z.coerce.number().int().optional(),
    outstanding: bool.optional().openapi({ description: "true : factures avec un solde à encaisser" }),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.account_id", q.account_id);
    eq(w, "t.fiscal_year", q.fiscal_year);
    if (q.outstanding) w.clauses.push("COALESCE(t.amount, 0) - COALESCE(t.collected, 0) > 0");
    return w;
  },
  search: ["t.product", "t.vendor", "a.name", "t.comments"],
  orderBy: "COALESCE(t.invoice_date, t.fiscal_year || '-12-31') DESC, t.id DESC",
  select: accountJoin("invoices"),
  present: (r) => ({ ...r, ...invoiceComputed(r as never) }),
  label: (r) => `${r.product}${r.fiscal_year ? ` ${r.fiscal_year}` : ""}`,
};

// ---------- Renouvellements ----------

const renewalInput = z
  .object({
    ...accountRef,
    contract: z.string().trim().min(1),
    last_invoice_date: optionalDate,
    last_amount: optionalAmount,
    history: optionalText,
    due_date_override: optionalDate.openapi({ description: "À renseigner seulement si l'échéance n'est pas dernière facturation + 12 mois" }),
    status: z.enum(LISTS.renewal_statuses).optional(),
    owner: optionalText,
    last_reminder_date: optionalDate,
    next_action: optionalText,
    comments: optionalText,
  })
  .openapi("RenewalInput");

export const renewalSpec: ResourceSpec = {
  entity: "renewal",
  path: "renewals",
  table: "renewals",
  tag: "Renouvellements",
  noun: "le renouvellement",
  description:
    "Contrats récurrents. Échéance = dernière facturation + 12 mois ; relances à J-90 et J-30 ; alerte calculée (Échu - urgent, À relancer (≤ 90 j), À venir…).",
  input: renewalInput,
  output: renewalInput
    .extend({
      ...timestamps,
      ...accountOut,
      due_date: z.string().nullable(),
      days_left: z.number().nullable(),
      reminder_90: z.string().nullable(),
      reminder_30: z.string().nullable(),
      alert: z.string(),
    })
    .openapi("Renewal"),
  filters: z.object({ account_id: z.coerce.number().int().optional(), status: z.string().optional() }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.account_id", q.account_id);
    eq(w, "t.status", q.status);
    return w;
  },
  search: ["t.contract", "a.name", "t.next_action", "t.comments"],
  orderBy: "COALESCE(t.due_date_override, date(t.last_invoice_date, '+12 months'), '9999') , t.id",
  select: accountJoin("renewals"),
  present: (r) => ({ ...r, ...renewalComputed(r as never) }),
  label: (r) => String(r.contract),
};

// ---------- Opportunités (stratégie de compte) ----------

const opportunityInput = z
  .object({
    ...accountRef,
    title: z.string().trim().min(1),
    solution: optionalText,
    priority,
    due_date: optionalDate,
    owner: optionalText,
    action: optionalText.openapi({ description: "Valeur pour le client / action à mener" }),
    comments: optionalText,
  })
  .openapi("OpportunityInput");

export const opportunitySpec: ResourceSpec = {
  entity: "opportunity",
  path: "opportunities",
  table: "opportunities",
  tag: "Comptes",
  noun: "l'opportunité",
  description: "Stratégie de continuité et de développement d'un compte (vente croisée, renouvellement).",
  input: opportunityInput,
  output: opportunityInput.extend({ ...timestamps, ...accountOut }).openapi("Opportunity"),
  filters: z.object({ account_id: z.coerce.number().int().optional() }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.account_id", q.account_id);
    return w;
  },
  search: ["t.title", "t.solution", "t.action", "a.name"],
  orderBy: "COALESCE(t.priority, 'P9'), t.id",
  select: accountJoin("opportunities"),
  present: (r) => r,
  label: (r) => String(r.title),
};

// ---------- Contacts ----------

const contactInput = z
  .object({
    account_id: z.number().int().positive().nullable().optional(),
    company: optionalText,
    sector: optionalText,
    name: z.string().trim().min(1),
    role: optionalText.openapi({ description: "Fonction" }),
    profile: z.enum(LISTS.contact_profiles).nullable().optional(),
    phone: optionalText,
    email: z.string().trim().max(320).nullable().optional(),
    pipeline_link: optionalText.openapi({ description: "Lien avec le pipeline IAT (compte, prospect ou cible concernés)" }),
    status: z.enum(LISTS.contact_statuses).nullable().optional(),
    last_contact: optionalDate,
    comments: optionalText,
    source: z.enum(["client_base", "research", "manual"]).optional(),
  })
  .openapi("ContactInput");

export const contactSpec: ResourceSpec = {
  entity: "contact",
  path: "contacts",
  table: "contacts",
  tag: "Contacts",
  noun: "le contact",
  description: "Base clients Côte d'Ivoire et dirigeants identifiés, rattachés aux comptes du pipeline quand c'est le cas.",
  input: contactInput,
  output: contactInput.extend({ ...timestamps, ...accountOut }).openapi("Contact"),
  filters: z.object({
    account_id: z.coerce.number().int().optional(),
    profile: z.string().optional(),
    status: z.string().optional(),
    sector: z.string().optional(),
    linked: bool.optional().openapi({ description: "true : contacts rattachés au pipeline, aux clients ou aux cibles" }),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.account_id", q.account_id);
    eq(w, "t.profile", q.profile);
    eq(w, "t.status", q.status);
    eq(w, "t.sector", q.sector);
    if (q.linked !== undefined) w.clauses.push(q.linked ? "t.pipeline_link IS NOT NULL" : "t.pipeline_link IS NULL");
    return w;
  },
  search: ["t.name", "t.company", "t.role", "t.email", "t.phone", "t.pipeline_link"],
  orderBy: "t.account_id IS NULL, t.pipeline_link IS NULL, t.company COLLATE NOCASE, t.name COLLATE NOCASE",
  select: accountJoin("contacts"),
  present: (r) => r,
  label: (r) => `${r.name}${r.company ? ` (${r.company})` : ""}`,
};

// ---------- Appels d'offres ----------

const tenderInput = z
  .object({
    organization: z.string().trim().min(1),
    subject: optionalText,
    reference: optionalText,
    published_on: optionalDate,
    deadline: optionalDate.openapi({ description: "Date limite de dépôt" }),
    estimated_amount: optionalAmount,
    response_mode: optionalText,
    partners: optionalText,
    requirements: optionalText,
    stage: z.enum(LISTS.tender_stages).nullable().optional(),
    owner: optionalText,
    comments: optionalText,
  })
  .openapi("TenderInput");

export const tenderSpec: ResourceSpec = {
  entity: "tender",
  path: "tenders",
  table: "tenders",
  tag: "Appels d'offres",
  noun: "l'appel d'offres",
  input: tenderInput,
  output: tenderInput.extend({ ...timestamps, days_left: z.number().nullable() }).openapi("Tender"),
  search: ["t.organization", "t.subject", "t.reference", "t.comments"],
  orderBy: "COALESCE(t.deadline, '9999'), t.id",
  present: (r) => ({ ...r, ...tenderComputed(r as never) }),
  label: (r) => `${r.organization} — ${r.subject ?? ""}`,
};

// ---------- Solutions, prospects et pitchs ----------

const solutionInput = z
  .object({
    name: z.string().trim().min(1),
    vendor: optionalText,
    category: optionalText,
    partnership_status: optionalText,
    internal_expert: optionalText,
    mastery: z.enum(LISTS.mastery).nullable().optional().openapi({ description: "Maîtrise commerciale" }),
    target_sectors: optionalText,
    value_pitch: optionalText,
    existing_clients: optionalText,
    materials: optionalText,
    priority,
    next_action: optionalText,
  })
  .openapi("SolutionInput");

export const solutionSpec: ResourceSpec = {
  entity: "solution",
  path: "solutions",
  table: "solutions",
  tag: "Solutions",
  noun: "la solution",
  description: "Catalogue : ce qu'on vend, avec quel partenaire et quel niveau de maîtrise.",
  input: solutionInput,
  output: solutionInput.extend({ ...timestamps, prospects_count: z.number().int() }).openapi("Solution"),
  search: ["t.name", "t.vendor", "t.category", "t.target_sectors"],
  orderBy: "COALESCE(t.priority, 'P9'), t.id",
  select: "SELECT t.*, (SELECT COUNT(*) FROM prospects p WHERE p.solution_id = t.id) AS prospects_count FROM solutions t",
  present: (r) => r,
  label: (r) => String(r.name),
  deletable: false,
};

const prospectInput = z
  .object({
    solution_id: z.number().int().positive().openapi({ description: "Identifiant de la solution (GET /solutions)" }),
    company: z.string().trim().min(1),
    sector: optionalText,
    contact: optionalText,
    angle: optionalText.openapi({ description: "Angle d'attaque / besoin" }),
    stage: stage.nullable().optional(),
    attack_week: optionalDate.openapi({ description: "Semaine d'attaque (lundi)" }),
    next_action: optionalText,
    owner: optionalText,
    relationship_score: z.number().int().min(0).max(5).nullable().optional().openapi({ description: "Relation IAG, de 0 à 5" }),
    last_action_date: optionalDate,
    comments: optionalText,
  })
  .openapi("ProspectInput");

export const prospectSpec: ResourceSpec = {
  entity: "prospect",
  path: "prospects",
  table: "prospects",
  tag: "Solutions",
  noun: "le prospect",
  description: "Prospects par solution (objectif : au moins un prospect attaqué par semaine).",
  input: prospectInput,
  output: prospectInput
    .extend({ ...timestamps, solution_name: z.string(), stage_label: z.string().nullable() })
    .openapi("Prospect"),
  filters: z.object({
    solution_id: z.coerce.number().int().optional(),
    stage: stage.optional(),
    sector: z.string().optional(),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.solution_id", q.solution_id);
    eq(w, "t.stage", q.stage);
    eq(w, "t.sector", q.sector);
    return w;
  },
  search: ["t.company", "t.sector", "t.contact", "t.angle", "s.name"],
  orderBy: "t.solution_id, COALESCE(t.attack_week, '9999'), t.id",
  select: "SELECT t.*, s.name AS solution_name FROM prospects t JOIN solutions s ON s.id = t.solution_id",
  present: (r) => ({ ...r, stage_label: r.stage ? stageLabel(String(r.stage)) : null }),
  label: (r) => `${r.company} (${r.solution_name ?? "solution"})`,
};

const pitchInput = z
  .object({
    solution_id: z.number().int().positive(),
    segment: z.string().trim().min(1),
    promise: optionalText,
    stake: optionalText.openapi({ description: "Enjeu pour la cible" }),
    offer: optionalText.openapi({ description: "Ce que nous apportons" }),
    hook: optionalText.openapi({ description: "Accroche d'ouverture" }),
    call_to_action: optionalText,
    targets: optionalText.openapi({ description: "Cibles prioritaires" }),
  })
  .openapi("PitchInput");

export const pitchSpec: ResourceSpec = {
  entity: "pitch",
  path: "pitches",
  table: "pitches",
  tag: "Solutions",
  noun: "le pitch",
  input: pitchInput,
  output: pitchInput.extend({ ...timestamps, solution_name: z.string() }).openapi("Pitch"),
  filters: z.object({ solution_id: z.coerce.number().int().optional() }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} };
    eq(w, "t.solution_id", q.solution_id);
    return w;
  },
  search: ["t.segment", "t.promise", "t.targets"],
  orderBy: "t.id",
  select: "SELECT t.*, s.name AS solution_name FROM pitches t JOIN solutions s ON s.id = t.solution_id",
  present: (r) => r,
  label: (r) => String(r.segment),
};

// ---------- Plan d'actions ----------

const actionInput = z
  .object({
    title: z.string().trim().min(1),
    related_to: optionalText.openapi({ description: "Lié à (compte, solution, onglet…)" }),
    account_id: z.number().int().positive().nullable().optional(),
    owner: optionalText,
    due_date: optionalDate,
    priority,
    status: z.enum(LISTS.action_statuses).optional(),
    comments: optionalText,
  })
  .openapi("ActionInput");

export const actionSpec: ResourceSpec = {
  entity: "action",
  path: "actions",
  table: "actions",
  tag: "Plan d'actions",
  noun: "l'action",
  description: "Check-list des actions décidées. Une action est en retard si son échéance est passée et qu'elle n'est ni faite ni abandonnée.",
  input: actionInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }),
  output: actionInput
    .extend({
      ...timestamps,
      ...accountOut,
      number: z.number().int(),
      done: z.boolean(),
      overdue: z.boolean(),
      days_to_due: z.number().nullable(),
    })
    .openapi("Action"),
  filters: z.object({
    number: z.coerce.number().int().optional().openapi({ description: "Numéro de l'action" }),
    status: z.string().optional(),
    owner: z.string().optional(),
    priority: z.enum(["P1", "P2", "P3"]).optional(),
    account_id: z.coerce.number().int().optional(),
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
    eq(w, "t.account_id", q.account_id);
    if (q.open !== undefined) w.clauses.push(`t.status ${q.open ? "NOT " : ""}IN ('Fait', 'Abandonné')`);
    if (q.overdue) {
      w.clauses.push("t.status NOT IN ('Fait', 'Abandonné') AND t.due_date < :today");
      w.params.today = new Date().toISOString().slice(0, 10);
    }
    if (q.due_before) {
      w.clauses.push("t.due_date <= :due_before");
      w.params.due_before = String(q.due_before);
    }
    return w;
  },
  search: ["t.title", "t.related_to", "t.owner", "t.comments"],
  orderBy: "t.status IN ('Fait', 'Abandonné'), COALESCE(t.due_date, '9999'), t.priority, t.number",
  select: accountJoin("actions"),
  present: (r) => ({ ...r, ...actionComputed(r as never) }),
  label: (r) => `Action ${r.number} : ${r.title}`,
  prepare: (db, data, existing) => (existing || data.number ? data : { ...data, number: nextNumber(db, "actions") }),
};

export const SPECS = [
  accountSpec,
  dealSpec,
  invoiceSpec,
  renewalSpec,
  opportunitySpec,
  contactSpec,
  tenderSpec,
  solutionSpec,
  prospectSpec,
  pitchSpec,
  actionSpec,
];

export function registerResources(app: OpenAPIHono<AppEnv>) {
  for (const spec of SPECS) registerResource(app, spec);
}

export { ApiError };
