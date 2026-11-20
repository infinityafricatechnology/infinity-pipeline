import { createContext, type ReactNode, useContext, useEffect } from "react";

/** Filiales gérées par l'application ; chacune a ses données, sa navigation et ses couleurs. */
export type SpaceCode = "iat" | "iap" | "iac" | "iaf" | "iag";

export type SpaceInfo = {
  code: SpaceCode;
  name: string;
  fullName: string;
  /** Ce qu'on y suit, en quelques mots (écran de choix, menu de bascule). */
  tagline: string;
  /** Préfixe des pages de l'espace : /iat, /iap. */
  base: string;
  /** Préfixe de l'API : "" pour IAT (routes historiques), "/iap", "/iac", "/iaf", "/groupe" pour les autres. */
  api: string;
  favicon: string;
};

export const SPACES: Record<SpaceCode, SpaceInfo> = {
  iat: {
    code: "iat",
    name: "IAT",
    fullName: "Infinity Africa Technologies",
    tagline: "Pipeline commercial, comptes et renouvellements",
    base: "/iat",
    api: "",
    favicon: "/favicon.svg",
  },
  iap: {
    code: "iap",
    name: "IAP",
    fullName: "Infinity Africa Properties",
    tagline: "Mandats immobiliers et commissions",
    base: "/iap",
    api: "/iap",
    favicon: "/favicon-iap.svg",
  },
  iac: {
    code: "iac",
    name: "IAC",
    fullName: "Infinity Africa Capital",
    tagline: "Mobilisation de capitaux, honoraires et commissions de succès",
    base: "/iac",
    api: "/iac",
    favicon: "/favicon-iac.svg",
  },
  iaf: {
    code: "iaf",
    name: "IAF",
    fullName: "Infinity Africa Finance",
    tagline: "Levées de fonds, financements et recouvrement",
    base: "/iaf",
    api: "/iaf",
    favicon: "/favicon-iaf.svg",
  },
  iag: {
    code: "iag",
    name: "Groupe",
    fullName: "Groupe IAG",
    tagline: "Vue consolidée des filiales et partenaires stratégiques",
    base: "/groupe",
    api: "/groupe",
    favicon: "/favicon-iag.svg",
  },
};

export const SPACE_LIST = [SPACES.iag, SPACES.iat, SPACES.iap, SPACES.iac, SPACES.iaf];

/** Filiales IAC et IAF : même modèle d'affaires (pages partagées dans pages/fin). */
export const isFinSpace = (code: SpaceCode): code is "iac" | "iaf" => code === "iac" || code === "iaf";

const SpaceContext = createContext<SpaceInfo>(SPACES.iat);

export function SpaceProvider({ space, children }: { space: SpaceCode; children: ReactNode }) {
  useSpaceTheme(space);
  return <SpaceContext.Provider value={SPACES[space]}>{children}</SpaceContext.Provider>;
}

export const useSpace = () => useContext(SpaceContext);

// ---------- Dernier espace utilisé (confort : sans stockage, l'écran de choix s'affiche normalement) ----------

const LAST_KEY = "infinity-pipeline.space";

export function lastSpace(): SpaceCode | null {
  try {
    const value = window.localStorage.getItem(LAST_KEY);
    return value && value in SPACES ? (value as SpaceCode) : null;
  } catch {
    return null;
  }
}

function rememberSpace(space: SpaceCode) {
  try {
    window.localStorage.setItem(LAST_KEY, space);
  } catch {
    /* navigation privée : rien à retenir */
  }
}

// ---------- Apparence ----------

/**
 * Couleurs, titre de l'onglet et favicon de l'espace. La bascule d'un espace à l'autre est
 * accompagnée d'un court fondu des couleurs (désactivé si l'utilisateur réduit les animations).
 */
export function applySpaceTheme(space: SpaceCode | null) {
  const root = document.documentElement;
  const previous = root.dataset.space;
  if (space) root.dataset.space = space;
  else delete root.dataset.space;
  if (previous && space && previous !== space) {
    root.classList.add("space-switching");
    window.setTimeout(() => root.classList.remove("space-switching"), 420);
  }
  const info = space ? SPACES[space] : null;
  document.title = info ? `${info.name} · Infinity Pipeline` : "Infinity Pipeline";
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    if (!link.dataset.original) link.dataset.original = link.getAttribute("href") ?? "";
    if (info && info.code !== "iat") {
      link.href = info.favicon;
      link.type = "image/svg+xml";
    } else {
      link.href = link.dataset.original;
      if (link.dataset.original.endsWith(".ico")) link.removeAttribute("type");
    }
  }
}

function useSpaceTheme(space: SpaceCode) {
  useEffect(() => {
    applySpaceTheme(space);
    rememberSpace(space);
  }, [space]);
}

/**
 * Adresse équivalente dans l'autre espace : on reste sur la même rubrique quand elle existe
 * (affaires → affaires), sinon on arrive sur la vue d'ensemble.
 */
const SHARED_SECTIONS = ["affaires", "actions", "contacts", "journal", "reglages"];

export function equivalentPath(pathname: string, target: SpaceCode): string {
  const section = pathname.split("/")[2] ?? "";
  return SHARED_SECTIONS.includes(section) ? `${SPACES[target].base}/${section}` : SPACES[target].base;
}
