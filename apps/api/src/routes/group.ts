/**
 * Espace Groupe (IAG) : vue consolidée des filiales et cartographie des partenaires stratégiques.
 * Routes sous `/groupe/…`, réservées aux comptes ayant l'espace « iag » (requireSpaces, auth.ts).
 */
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../auth.ts";
import { all, one, type Row } from "../db.ts";
import { OPEN_STAGES, today } from "../domain.ts";
import { FIN_SPACE_INFO, PARTNER_LISTS, partnerComputed } from "../domain-fin.ts";
import { eq, isoDate, optionalAmount, optionalDate, optionalText, registerResource, type ResourceSpec, timestamps } from "../resource.ts";
import { FIN_SPACES, type Space, SPACES } from "../spaces.ts";
import { buildFinSummary } from "./fin.ts";
import { buildIapSummary } from "./iap.ts";
import { buildSummary } from "./insights.ts";

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

// ---------- Partenaires ----------

const partnerInput = z.object({
  entity: z.enum(PARTNER_LISTS.entities).optional().openapi({ description: "Entité du groupe concernée : Groupe, IAT, IAP, IAC ou IAF" }),
  name: z.string().trim().min(1).openapi({ description: "Nom du partenaire" }),
  type: optionalText.openapi({ description: "Type : Fintech, Opérateur, Éditeur, Immobilier, Conseil…" }),
  zone: optionalText.openapi({ description: "Zone ou marché" }),
  expertise: optionalText.openapi({ description: "Expertise ou offre du partenaire" }),
  complementarity: optionalText.openapi({ description: "Complémentarité avec IAG" }),
  market_access: optionalText.openapi({ description: "Accès marché / clients apporté" }),
  potential: z.enum(PARTNER_LISTS.potentials).nullable().optional().openapi({ description: "Potentiel commercial : Élevé, Moyen ou Faible" }),
  model: optionalText.openapi({ description: "Modèle de partenariat (co-vente, intégration, apport d'affaires…)" }),
  relationship: optionalText.openapi({ description: "Niveau de relation (active, en développement…)" }),
  legal_status: optionalText.openapi({ description: "Statut juridique / NDA" }),
  iag_referent: optionalText.openapi({ description: "Référent côté IAG" }),
  partner_referent: optionalText.openapi({ description: "Référent côté partenaire" }),
  opportunities: optionalText.openapi({ description: "Opportunités conjointes" }),
  potential_revenue: optionalAmount.openapi({ description: "Chiffre d'affaires potentiel, en FCFA" }),
  margin: optionalText.openapi({ description: "Marge ou commission IAG" }),
  last_interaction: optionalDate.openapi({ description: "Date de la dernière interaction" }),
  next_action: optionalText,
  due_date: optionalDate.openapi({ description: "Échéance de la prochaine action" }),
  priority: z.enum(PARTNER_LISTS.priorities).nullable().optional(),
  risks: optionalText.openapi({ description: "Risques et dépendances" }),
});

export const partnerSpec: ResourceSpec = {
  entity: "partner",
  path: "groupe/partners",
  table: "partners",
  tag: "Groupe · Partenaires",
  noun: "le partenaire",
  description: "Cartographie des partenaires stratégiques du groupe IAG : potentiel, complémentarité, référents, prochaine action et échéance.",
  input: partnerInput.extend({ number: z.number().int().positive().optional().openapi({ description: "Attribué automatiquement" }) }).openapi("PartnerInput"),
  output: partnerInput
    .extend({ ...timestamps, number: z.number().int(), entity: z.string(), days_to_due: z.number().nullable(), overdue: z.boolean() })
    .openapi("Partner"),
  filters: z.object({
    entity: z.enum(PARTNER_LISTS.entities).optional(),
    potential: z.enum(PARTNER_LISTS.potentials).optional(),
    priority: z.enum(PARTNER_LISTS.priorities).optional(),
    referent: z.string().optional().openapi({ description: "Référent IAG" }),
    overdue: bool.optional().openapi({ description: "true : échéance de la prochaine action dépassée" }),
    due_before: isoDate.optional(),
  }),
  where: (q: Row) => {
    const w = { clauses: [] as string[], params: {} as Record<string, string | number> };
    eq(w, "t.entity", q.entity);
    eq(w, "t.potential", q.potential);
    eq(w, "t.priority", q.priority);
    if (q.referent) {
      w.clauses.push("unaccent(t.iag_referent) = unaccent(:referent)");
      w.params.referent = String(q.referent);
    }
    if (q.overdue) {
      w.clauses.push("t.due_date < :today");
      w.params.today = today();
    }
    if (q.due_before) {
      w.clauses.push("t.due_date <= :due_before");
      w.params.due_before = String(q.due_before);
    }
    return w;
  },
  search: ["t.name", "t.type", "t.zone", "t.expertise", "t.opportunities", "t.iag_referent", "t.partner_referent", "t.next_action", "t.risks"],
  orderBy: "t.priority IS NULL, t.priority, COALESCE(t.due_date, '9999'), t.number",
  present: (r) => ({ ...r, ...partnerComputed(r as never) }),
  label: (r) => `${r.name}${r.entity ? ` (${r.entity})` : ""}`,
  prepare: (db, data, existing) => {
    if (existing || data.number) return data;
    const n = Number(one<{ n: number }>(db, "SELECT COALESCE(MAX(number), 0) + 1 AS n FROM partners")!.n);
    return { entity: "Groupe", ...data, number: n };
  },
};

// ---------- Vue consolidée ----------

type SpaceTotals = {
  space: Space;
  name: string;
  full_name: string;
  deals_count: number;
  open_count: number;
  open_amount: number;
  weighted_amount: number;
  /** Revenu attendu des affaires : marge IAT, commission IAP, honoraire + commission IAC / IAF. */
  revenue: number;
  won_amount: number;
  received: number;
  overdue_actions_count: number;
};

const info = (space: Space) => SPACES.find((s) => s.code === space)!;

function spaceTotals(db: DatabaseSync, space: Space): SpaceTotals {
  const base = { space, name: info(space).name, full_name: info(space).full_name };
  if (space === "iat") {
    const s = buildSummary(db);
    const open = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM deals WHERE stage IN (${OPEN_STAGES.map((c) => `'${c}'`).join(",")})`)!.n;
    return {
      ...base,
      deals_count: s.pipeline.deals_count,
      open_count: Number(open),
      open_amount: s.pipeline.open_amount,
      weighted_amount: s.pipeline.weighted_amount,
      revenue: s.pipeline.commission,
      won_amount: s.pipeline.won_amount,
      received: s.billing.collected,
      overdue_actions_count: s.pipeline.overdue_actions_count,
    };
  }
  if (space === "iap") {
    const s = buildIapSummary(db);
    return {
      ...base,
      deals_count: s.pipeline.deals_count,
      open_count: s.pipeline.open_count,
      open_amount: s.pipeline.open_amount,
      weighted_amount: s.pipeline.weighted_amount,
      revenue: s.pipeline.commission,
      won_amount: s.pipeline.won_amount,
      received: s.pipeline.commission_received,
      overdue_actions_count: s.pipeline.overdue_actions_count,
    };
  }
  const s = buildFinSummary(db, space as (typeof FIN_SPACES)[number]);
  return {
    ...base,
    deals_count: s.pipeline.deals_count,
    open_count: s.pipeline.open_count,
    open_amount: s.pipeline.open_amount,
    weighted_amount: s.pipeline.weighted_amount,
    revenue: s.pipeline.revenue,
    won_amount: s.pipeline.won_amount,
    received: s.cash.received,
    overdue_actions_count: s.pipeline.overdue_actions_count,
  };
}

/** Totaux par filiale et pour le groupe, limités aux filiales accessibles au compte. */
export function buildGroupSummary(db: DatabaseSync, allowed: Space[]) {
  const spaces = (["iat", "iap", ...FIN_SPACES] as Space[]).filter((s) => allowed.includes(s));
  const subsidiaries = spaces.map((s) => spaceTotals(db, s));
  const total = (key: keyof SpaceTotals) => subsidiaries.reduce((acc, s) => acc + Number(s[key]), 0);
  const partners = all<Row>(db, "SELECT * FROM partners").map((p): Row & { overdue: boolean } => ({ ...p, ...partnerComputed(p as never) }));
  return {
    as_of: today(),
    subsidiaries,
    totals: {
      deals_count: total("deals_count"),
      open_count: total("open_count"),
      open_amount: total("open_amount"),
      weighted_amount: total("weighted_amount"),
      revenue: total("revenue"),
      won_amount: total("won_amount"),
      received: total("received"),
      overdue_actions_count: total("overdue_actions_count"),
    },
    partners: {
      count: partners.length,
      high_potential_count: partners.filter((p) => p.potential === "Élevé").length,
      p1_count: partners.filter((p) => p.priority === "P1").length,
      overdue_count: partners.filter((p) => p.overdue).length,
      potential_revenue: partners.reduce((acc, p) => acc + Number(p.potential_revenue ?? 0), 0),
      by_entity: PARTNER_LISTS.entities.map((e) => ({ key: e, count: partners.filter((p) => p.entity === e).length })),
    },
  };
}

export function registerGroup(app: OpenAPIHono<AppEnv>) {
  registerResource(app, partnerSpec);
  const tags = ["Groupe · Synthèse"];
  const Obj = (name: string) => z.record(z.string(), z.unknown()).openapi(name);

  app.openapi(
    createRoute({
      method: "get",
      path: "/groupe/summary",
      tags,
      operationId: "get_group_summary",
      summary: "Vue consolidée du groupe IAG",
      description:
        "Une ligne par filiale accessible au compte (IAT, IAP, IAC, IAF) et le total du groupe : affaires en cours, pipeline, pondéré, revenu attendu (marge IAT, commission IAP, honoraire + commission IAC/IAF), gagné, encaissé ; plus les indicateurs des partenaires.",
      responses: { 200: json(Obj("GroupSummary"), "Synthèse consolidée") },
    }),
    (c) => c.json(buildGroupSummary(c.var.db, c.var.actor.user.spaces), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/groupe/lists",
      tags,
      operationId: "get_group_lists",
      summary: "Groupe : valeurs admises",
      description: "Entités, niveaux de potentiel et priorités des partenaires ; nom des filiales.",
      responses: { 200: json(Obj("GroupLists"), "Listes de valeurs") },
    }),
    (c) => c.json({ ...PARTNER_LISTS, subsidiaries: FIN_SPACE_INFO } as never, 200),
  );
}
