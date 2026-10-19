import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../auth.ts";
import { all, one, type Row } from "../db.ts";
import {
  ACCOUNT_KINDS,
  actionComputed,
  addDays,
  dealComputed,
  invoiceComputed,
  LISTS,
  OPEN_STAGES,
  renewalComputed,
  STAGES,
  today,
} from "../domain.ts";
import { ErrorSchema } from "../resource.ts";
import { accountSpec, actionSpec, contactSpec, dealSpec, invoiceSpec, opportunitySpec, renewalSpec } from "./resources.ts";

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const sum = (values: (number | null | undefined)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
const ratio = (a: number, b: number) => (b ? a / b : null);

type DealRow = {
  stage: string;
  amount: number | null;
  commission: number | null;
  closing: number | null;
  due_date: string | null;
  priority: string | null;
  lead: string | null;
  account_kind: string;
  account_id: number;
};
type InvoiceRow = { amount: number | null; collected: number | null; cost_of_sales: number | null; commission: number | null; fiscal_year: number | null; account_id: number };
type RenewalRow = { last_amount: number | null; last_invoice_date: string | null; due_date_override: string | null; status: string };
type ActionRow = { due_date: string | null; status: string };

function loadDeals(db: DatabaseSync) {
  return all<DealRow>(db, `${dealSpec.select} ORDER BY t.number`).map((r) => ({ ...r, ...dealComputed(r) }));
}

/** Équivalent calculé de l'onglet « Synthèse » du classeur. */
export function buildSummary(db: DatabaseSync) {
  const deals = loadDeals(db);
  const invoices = all<InvoiceRow>(db, "SELECT * FROM invoices").map((r) => ({ ...r, ...invoiceComputed(r) }));
  const renewals = all<RenewalRow>(db, "SELECT * FROM renewals").map((r) => ({ ...r, ...renewalComputed(r) }));
  const actions = all<ActionRow>(db, "SELECT * FROM actions").map((r) => ({ ...r, ...actionComputed(r) }));
  const contacts = one<Row>(
    db,
    `SELECT COUNT(*) AS total,
            SUM(pipeline_link IS NOT NULL) AS linked,
            SUM(profile = 'Direction SI / digital') AS it_leaders,
            SUM(status = 'Coordonnées à vérifier') AS to_verify,
            SUM(status = 'RDV obtenu') AS meetings,
            SUM(source = 'research') AS researched
       FROM contacts`,
  )!;

  const pipelineTotal = sum(deals.map((d) => d.amount));
  const commissionTotal = sum(deals.map((d) => d.commission));
  const amountAt = (codes: string[]) => sum(deals.filter((d) => codes.includes(d.stage)).map((d) => d.amount));
  const invoiced = sum(invoices.map((i) => i.amount));
  const collected = sum(invoices.map((i) => i.collected));
  const expired = renewals.filter((r) => r.alert === "Échu - urgent");

  const group = <K extends string>(keyOf: (d: (typeof deals)[number]) => K, keys: K[]) =>
    keys.map((key) => {
      const items = deals.filter((d) => keyOf(d) === key);
      const amount = sum(items.map((d) => d.amount));
      const commission = sum(items.map((d) => d.commission));
      return {
        key,
        count: items.length,
        amount,
        weighted_amount: sum(items.map((d) => d.weighted_amount)),
        commission,
        profitability: ratio(commission, amount),
        p1_count: items.filter((d) => d.priority === "P1").length,
      };
    });

  const leads = [...new Set(deals.map((d) => d.lead ?? "Non renseigné"))];
  const fiches = all<{ id: number; slug: string; name: string; health: string | null }>(db, "SELECT id, slug, name, health FROM accounts WHERE has_fiche = 1 ORDER BY id");
  const years = [...new Set(invoices.map((i) => i.fiscal_year).filter((y): y is number => y != null))].sort();

  return {
    as_of: today(),
    pipeline: {
      deals_count: deals.length,
      total_amount: pipelineTotal,
      weighted_amount: sum(deals.map((d) => d.weighted_amount)),
      commission: commissionTotal,
      profitability: ratio(commissionTotal, pipelineTotal),
      won_amount: amountAt(["M6"]),
      offers_amount: amountAt(["M4", "M5"]),
      open_amount: amountAt(OPEN_STAGES),
      to_qualify_count: deals.filter((d) => d.stage === "M0").length,
      p1_count: deals.filter((d) => d.priority === "P1").length,
      open_actions_count: actions.filter((a) => !a.done).length,
      overdue_actions_count: actions.filter((a) => a.overdue).length,
    },
    billing: {
      years,
      invoiced,
      collected,
      outstanding: invoiced - collected,
      collection_rate: ratio(collected, invoiced),
      recurring_annual: sum(renewals.map((r) => r.last_amount)),
      expired_amount: sum(expired.map((r) => r.last_amount)),
      expired_count: expired.length,
      to_remind_count: renewals.filter((r) => r.alert.startsWith("À relancer")).length,
    },
    contacts: {
      total: Number(contacts.total),
      linked: Number(contacts.linked ?? 0),
      it_leaders: Number(contacts.it_leaders ?? 0),
      to_verify: Number(contacts.to_verify ?? 0),
      meetings: Number(contacts.meetings ?? 0),
      researched: Number(contacts.researched ?? 0),
    },
    by_stage: group((d) => d.stage, STAGES.map((s) => s.code)).map((g) => ({
      ...g,
      label: STAGES.find((s) => s.code === g.key)!.label,
    })),
    by_kind: group((d) => d.account_kind, ACCOUNT_KINDS.map((k) => k.code)).map((g) => ({
      ...g,
      label: ACCOUNT_KINDS.find((k) => k.code === g.key)!.label,
    })),
    by_lead: group((d) => d.lead ?? "Non renseigné", leads),
    accounts: fiches.map((a) => {
      const own = invoices.filter((i) => i.account_id === a.id);
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        health: a.health,
        invoiced_by_year: Object.fromEntries(years.map((y) => [y, sum(own.filter((i) => i.fiscal_year === y).map((i) => i.amount))])),
        outstanding: sum(own.map((i) => i.balance)),
        open_offers: sum(deals.filter((d) => d.account_id === a.id && d.is_open).map((d) => d.amount)),
      };
    }),
  };
}

/** Ce qui demande une action dans les ``days`` jours : actions, relances de renouvellement, échéances d'affaires. */
export function buildAgenda(db: DatabaseSync, days: number) {
  const now = today();
  const horizon = addDays(now, days);
  const actions = all(db, `${actionSpec.select} WHERE t.status NOT IN ('Fait', 'Abandonné') AND t.due_date <= :horizon ORDER BY t.due_date, t.priority`, { horizon })
    .map((r) => actionSpec.present(r));
  const renewals = all(db, `${renewalSpec.select}`)
    .map((r) => renewalSpec.present(r))
    .filter((r) => r.alert === "Échu - urgent" || r.alert === "Date à confirmer" || (r.reminder_90 != null && String(r.reminder_90) <= horizon && r.alert !== "Renouvelé" && r.alert !== "Perdu"));
  const deals = all(db, `${dealSpec.select} WHERE t.due_date <= :horizon AND t.stage IN (${OPEN_STAGES.map((s) => `'${s}'`).join(",")}) ORDER BY t.due_date`, { horizon })
    .map((r) => dealSpec.present(r));
  return { as_of: now, horizon, actions, renewals, deals };
}

export function registerInsights(app: OpenAPIHono<AppEnv>) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/summary",
      tags: ["Synthèse"],
      operationId: "get_summary",
      summary: "Synthèse du pipeline",
      description:
        "Indicateurs clés (pipeline, pondéré, gagné, commissions), facturation et encaissements, renouvellements échus, contacts, et répartitions par étape, type de compte, responsable et client.",
      responses: { 200: json(z.record(z.string(), z.unknown()).openapi("Summary"), "Synthèse") },
    }),
    (c) => c.json(buildSummary(c.var.db), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/agenda",
      tags: ["Synthèse"],
      operationId: "get_agenda",
      summary: "À traiter prochainement",
      description:
        "Actions non faites dont l'échéance tombe dans la période (retards compris), renouvellements échus ou à relancer (J-90 atteint), affaires en cours arrivant à échéance.",
      request: { query: z.object({ days: z.coerce.number().int().min(0).max(365).default(7) }) },
      responses: { 200: json(z.record(z.string(), z.unknown()).openapi("Agenda"), "Éléments à traiter") },
    }),
    (c) => c.json(buildAgenda(c.var.db, c.req.valid("query").days), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/accounts/{ref}/overview",
      tags: ["Comptes"],
      operationId: "get_account_overview",
      summary: "Fiche compte complète",
      description:
        "Le compte avec ses affaires, sa facturation (totaux par exercice), ses renouvellements, sa stratégie, ses contacts et dirigeants. `ref` est l'identifiant numérique ou le slug (ex. cnam, orange-business).",
      request: { params: z.object({ ref: z.string().openapi({ param: { name: "ref", in: "path" }, example: "cnam" }) }) },
      responses: {
        200: json(z.record(z.string(), z.unknown()).openapi("AccountOverview"), "Fiche compte"),
        404: json(ErrorSchema, "Compte introuvable"),
      },
    }),
    (c) => {
      const db = c.var.db;
      const { ref } = c.req.valid("param");
      const row = one(db, `${accountSpec.select} WHERE t.id = :id OR t.slug = :slug`, { id: Number(ref) || -1, slug: ref });
      if (!row) {
        const known = all<{ slug: string }>(db, "SELECT slug FROM accounts WHERE has_fiche = 1").map((a) => a.slug);
        return c.json({ error: `Compte « ${ref} » introuvable. Comptes avec fiche : ${known.join(", ")}.` }, 404);
      }
      const id = Number(row.id);
      const pick = (spec: typeof dealSpec, order: string) =>
        all(db, `${spec.select} WHERE t.account_id = :id ORDER BY ${order}`, { id }).map(spec.present);
      const invoices = pick(invoiceSpec, invoiceSpec.orderBy);
      const deals = pick(dealSpec, "t.number");
      return c.json(
        {
          account: accountSpec.present(row),
          deals,
          invoices,
          invoice_totals: {
            amount: sum(invoices.map((i) => i.amount as number)),
            commission: sum(invoices.map((i) => i.commission as number)),
            net_revenue: sum(invoices.map((i) => i.net_revenue as number)),
            margin: sum(invoices.map((i) => i.margin as number)),
            collected: sum(invoices.map((i) => i.collected as number)),
            balance: sum(invoices.map((i) => i.balance as number)),
          },
          open_offers_amount: sum(deals.filter((d) => d.is_open).map((d) => d.amount as number)),
          renewals: pick(renewalSpec, renewalSpec.orderBy),
          opportunities: pick(opportunitySpec, opportunitySpec.orderBy),
          contacts: pick(contactSpec, "t.source DESC, t.name COLLATE NOCASE"),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/lists",
      tags: ["Référentiel"],
      operationId: "get_lists",
      summary: "Valeurs admises",
      description: "Étapes, types de compte, priorités, statuts… À consulter avant de créer ou modifier pour employer les valeurs exactes.",
      responses: { 200: json(z.record(z.string(), z.unknown()).openapi("Lists"), "Listes de valeurs") },
    }),
    (c) => c.json(LISTS as never, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/activity",
      tags: ["Journal"],
      operationId: "list_activity",
      summary: "Journal des modifications",
      description: "Qui a modifié quoi, quand, et par quel canal (web, api, claude).",
      request: {
        query: z.object({
          entity: z.string().optional(),
          entity_id: z.coerce.number().int().optional(),
          via: z.enum(["web", "api", "claude", "import"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
      responses: { 200: json(z.record(z.string(), z.unknown()).openapi("ActivityPage"), "Événements, du plus récent au plus ancien") },
    }),
    (c) => {
      const q = c.req.valid("query");
      const clauses: string[] = [];
      const params: Record<string, string | number> = { limit: q.limit, offset: q.offset };
      if (q.entity) (clauses.push("e.entity = :entity"), (params.entity = q.entity));
      if (q.entity_id) (clauses.push("e.entity_id = :entity_id"), (params.entity_id = q.entity_id));
      if (q.via) (clauses.push("e.via = :via"), (params.via = q.via));
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { limit: _l, offset: _o, ...filters } = params;
      const total = Number(one<{ n: number }>(c.var.db, `SELECT COUNT(*) AS n FROM activity e ${where}`, filters)!.n);
      const results = all(
        c.var.db,
        `SELECT e.*, u.name AS user_name FROM activity e LEFT JOIN users u ON u.id = e.user_id ${where} ORDER BY e.id DESC LIMIT :limit OFFSET :offset`,
        params,
      ).map((e) => ({ ...e, changes: e.changes ? JSON.parse(String(e.changes)) : null }));
      return c.json({ results, total, limit: q.limit, offset: q.offset }, 200);
    },
  );
}
