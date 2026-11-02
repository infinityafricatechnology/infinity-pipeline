/**
 * Vocabulaire et règles d'IAP (Infinity Africa Properties), repris de PIPELINE IAP.xlsx et de la
 * fiche de commissionnement (docs/iap). Les valeurs dérivées sont calculées ici, jamais stockées.
 */
import { daysBetween, today } from "./domain.ts";

export const IAP_STAGES = [
  { code: "P0", label: "Mandat à signer", short: "Mandat à signer" },
  { code: "P1", label: "Mandat signé", short: "Mandat signé" },
  { code: "P2", label: "Présenté / visites", short: "Visites" },
  { code: "P3", label: "Offre / négociation", short: "Négociation" },
  { code: "P4", label: "Acompte / compromis", short: "Acompte" },
  { code: "P5", label: "Conclu", short: "Conclu" },
  { code: "LOST", label: "Perdu", short: "Perdu" },
] as const;

export type IapStageCode = (typeof IAP_STAGES)[number]["code"];
export const IAP_STAGE_CODES = IAP_STAGES.map((s) => s.code) as [IapStageCode, ...IapStageCode[]];
export const IAP_OPEN_STAGES: IapStageCode[] = ["P0", "P1", "P2", "P3", "P4"];
/** Étape où la vente ou la location est conclue. */
export const IAP_WON_STAGE: IapStageCode = "P5";

/**
 * Politique de commissionnement (fiche d'adhésion, effet au 14 septembre 2026) : parts calculées sur la
 * commission effectivement perçue par IAP, pas sur le prix du bien.
 */
export const COMMISSION_POLICY = {
  effective_from: "2026-09-14",
  apport_rate: 0.05,
  closing_rate: 0.1,
  combined_rate: 0.15,
} as const;

export const IAP_LISTS = {
  stages: IAP_STAGES,
  natures: [
    "Vente bien immobilier",
    "Vente de terrain",
    "Mandat de recherche",
    "Mandat de gestion",
    "Location",
    "Construction",
  ],
  people: ["Koumba Assanvo", "Serges Gnonblesson", "Sali Traoré", "Landry Digbeu"],
  contact_roles: ["Acquéreur", "Locataire", "Propriétaire", "Agence partenaire", "Apporteur d'affaires", "Autre"],
  priorities: ["P1", "P2", "P3"],
  /** Facilité de commercialisation du bien. */
  eases: ["Élevée", "Moyenne", "Faible"],
  /** État de la due diligence (vérification des documents) et de l'étude du marché. */
  review_states: ["Nécessaire", "En cours", "Fait", "N/A", "À définir"],
  /** Statuts libres du classeur, proposés en suggestion. */
  statuses: [
    "Pas encore signé",
    "Signé",
    "Commercialisation active",
    "Recherche active",
    "Gestion locative",
    "Visite de site à prévoir",
    "Attente des documents",
  ],
  action_statuses: ["À faire", "En cours", "Bloqué", "Fait", "Abandonné"],
  commission_policy: COMMISSION_POLICY,
} as const;

/** Due diligence ou étude du marché restant à mener. */
export const IAP_REVIEW_TODO = ["Nécessaire", "En cours", "À définir"] as const;

/** Accepte le code (« P1 ») ou le libellé (« Mandat signé »), sans tenir compte de la casse. */
export function normalizeIapStage(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  const found = IAP_STAGES.find((s) => s.code.toLowerCase() === v || s.label.toLowerCase() === v || s.short.toLowerCase() === v);
  return found ? found.code : value.trim();
}

export function iapStageLabel(code: string | null | undefined): string | null {
  return IAP_STAGES.find((s) => s.code === code)?.label ?? code ?? null;
}

type IapDealRow = {
  stage: string;
  amount: number | null;
  closing: number | null;
  commission_rate: number | null;
  due_date: string | null;
  apporteur: string | null;
  closeur: string | null;
  commission_received: number | null;
  apport_paid_at: string | null;
  closing_paid_at: string | null;
};

export function iapDealCommission(deal: Pick<IapDealRow, "amount" | "commission_rate">): number | null {
  return deal.amount != null && deal.commission_rate != null ? Math.round(deal.amount * deal.commission_rate) : null;
}

export type CommissionShare = {
  person: string;
  role: "apport" | "closing" | "apport_closing";
  rate: number;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  /** paid : versée ; due : IAP a perçu sa commission, part à verser ; expected : estimation, rien de perçu. */
  status: "paid" | "due" | "expected";
};

const samePerson = (a: string, b: string) =>
  a.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === b.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * Répartition de la commission d'une affaire entre apporteur et closeur.
 * Base : commission perçue par IAP si elle est connue, sinon commission attendue (part « estimée »).
 */
export function commissionSplit(deal: IapDealRow) {
  const expected = iapDealCommission(deal);
  const estimated = deal.commission_received == null;
  const base = deal.commission_received ?? expected;
  const shares: CommissionShare[] = [];
  const apporteur = deal.apporteur?.trim() || null;
  const closeur = deal.closeur?.trim() || null;
  const share = (person: string, role: CommissionShare["role"], rate: number, paidAt: string | null): CommissionShare => ({
    person,
    role,
    rate,
    amount: base == null ? 0 : Math.round(base * rate),
    paid: paidAt != null,
    paid_at: paidAt,
    status: paidAt != null ? "paid" : estimated ? "expected" : "due",
  });
  if (apporteur && closeur && samePerson(apporteur, closeur)) {
    shares.push(share(apporteur, "apport_closing", COMMISSION_POLICY.combined_rate, deal.apport_paid_at ?? deal.closing_paid_at));
  } else {
    if (apporteur) shares.push(share(apporteur, "apport", COMMISSION_POLICY.apport_rate, deal.apport_paid_at));
    if (closeur) shares.push(share(closeur, "closing", COMMISSION_POLICY.closing_rate, deal.closing_paid_at));
  }
  return { base, estimated, shares };
}

export function iapDealComputed(deal: IapDealRow, now = today()) {
  const commission = iapDealCommission(deal);
  const isOpen = IAP_OPEN_STAGES.includes(deal.stage as IapStageCode);
  const split = commissionSplit(deal);
  return {
    stage_label: iapStageLabel(deal.stage),
    commission,
    weighted_amount: deal.amount != null && deal.closing != null ? Math.round(deal.amount * deal.closing) : null,
    weighted_commission: commission != null && deal.closing != null ? Math.round(commission * deal.closing) : null,
    is_open: isOpen,
    days_to_due: deal.due_date ? daysBetween(now, deal.due_date) : null,
    overdue: isOpen && deal.due_date != null && deal.due_date < now,
    commission_base: split.base,
    commission_estimated: split.estimated,
    shares: split.shares,
  };
}
