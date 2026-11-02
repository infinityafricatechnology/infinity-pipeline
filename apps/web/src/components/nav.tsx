import type { ReactNode } from "react";
import type { SpaceCode } from "../lib/space";
import type { IapSummary, Summary } from "../lib/types";
import {
  IconAccounts,
  IconActions,
  IconActivity,
  IconCommission,
  IconContacts,
  IconDeals,
  IconOverview,
  IconRenewals,
  IconSettings,
  IconSolutions,
  IconTenders,
} from "./icons";

export type NavEntry = {
  to: string;
  label: string;
  icon: ReactNode;
  /** Groupe affiché avant l'entrée dans la barre latérale. */
  group?: string;
  /** Mots-clés de la recherche ⌘K. */
  words: string;
  count?: (summary: never) => number | undefined;
  alert?: boolean;
  countLabel?: string;
  /** Raccourcis supplémentaires proposés seulement dans la recherche ⌘K. */
  extra?: { label: string; to: string; words: string }[];
};

const IAT_NAV: NavEntry[] = [
  { to: "/iat", label: "Vue d’ensemble", icon: <IconOverview />, words: "accueil synthese tableau de bord" },
  {
    to: "/iat/affaires",
    label: "Affaires",
    icon: <IconDeals />,
    words: "pipeline deals opportunites",
    count: (s: Summary) => s.pipeline.deals_count,
    countLabel: "affaires",
    extra: [{ label: "Affaires par étape", to: "/iat/affaires?vue=etapes", words: "kanban colonnes etapes" }],
  },
  {
    to: "/iat/actions",
    label: "Plan d’actions",
    icon: <IconActions />,
    words: "taches a faire todo",
    count: (s: Summary) => s.pipeline.overdue_actions_count,
    alert: true,
    countLabel: "en retard",
  },
  {
    to: "/iat/renouvellements",
    label: "Renouvellements",
    icon: <IconRenewals />,
    words: "contrats echeances relances licences",
    count: (s: Summary) => s.billing.expired_count,
    alert: true,
    countLabel: "contrats échus",
  },
  { to: "/iat/comptes", label: "Comptes", icon: <IconAccounts />, group: "Portefeuille", words: "clients prospects partenaires" },
  { to: "/iat/solutions", label: "Solutions et prospects", icon: <IconSolutions />, words: "catalogue credolab wari pitch" },
  { to: "/iat/appels-offres", label: "Appels d’offres", icon: <IconTenders />, words: "ao consultation" },
  {
    to: "/iat/contacts",
    label: "Contacts",
    icon: <IconContacts />,
    words: "annuaire carnet",
    count: (s: Summary) => s.contacts.total,
    countLabel: "contacts",
  },
  { to: "/iat/journal", label: "Journal", icon: <IconActivity />, group: "Suivi", words: "historique activite modifications claude" },
  { to: "/iat/reglages", label: "Réglages", icon: <IconSettings />, words: "jeton claude mot de passe utilisateurs espaces" },
];

const IAP_NAV: NavEntry[] = [
  { to: "/iap", label: "Vue d’ensemble", icon: <IconOverview />, words: "accueil synthese tableau de bord immobilier" },
  {
    to: "/iap/affaires",
    label: "Affaires",
    icon: <IconDeals />,
    words: "mandats biens villas terrains ventes locations pipeline",
    count: (s: IapSummary) => s.pipeline.deals_count,
    countLabel: "affaires",
    extra: [{ label: "Affaires par étape", to: "/iap/affaires?vue=etapes", words: "kanban colonnes etapes mandats" }],
  },
  {
    to: "/iap/commissions",
    label: "Commissions",
    icon: <IconCommission />,
    words: "commissionnement apporteur closeur parts paiement",
  },
  {
    to: "/iap/actions",
    label: "Plan d’actions",
    icon: <IconActions />,
    words: "taches a faire relances visites",
    count: (s: IapSummary) => s.pipeline.overdue_actions_count,
    alert: true,
    countLabel: "en retard",
  },
  {
    to: "/iap/contacts",
    label: "Contacts",
    icon: <IconContacts />,
    group: "Portefeuille",
    words: "acquereurs proprietaires agences apporteurs clients",
    count: (s: IapSummary) => s.contacts_count,
    countLabel: "contacts",
  },
  { to: "/iap/journal", label: "Journal", icon: <IconActivity />, group: "Suivi", words: "historique activite modifications claude" },
  { to: "/iap/reglages", label: "Réglages", icon: <IconSettings />, words: "jeton claude mot de passe utilisateurs espaces" },
];

export const NAV: Record<SpaceCode, NavEntry[]> = { iat: IAT_NAV, iap: IAP_NAV };

/** Synthèse qui alimente les compteurs de la barre latérale. */
export const SUMMARY_PATH: Record<SpaceCode, string> = { iat: "/summary", iap: "/iap/summary" };
