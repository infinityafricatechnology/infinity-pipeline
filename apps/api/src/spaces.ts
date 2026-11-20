/** Filiales gérées par l'application. Chaque espace a ses propres données et ses propres droits d'accès. */
export const SPACES = [
  { code: "iat", name: "IAT", full_name: "Infinity Africa Technologies" },
  { code: "iap", name: "IAP", full_name: "Infinity Africa Properties" },
  { code: "iac", name: "IAC", full_name: "Infinity Africa Capital" },
  { code: "iaf", name: "IAF", full_name: "Infinity Africa Finance" },
  { code: "iag", name: "Groupe", full_name: "Groupe IAG" },
] as const;

export type Space = (typeof SPACES)[number]["code"];
export const SPACE_CODES = SPACES.map((s) => s.code) as [Space, ...Space[]];

/** Filiales de mobilisation de capitaux et de financement : même modèle d'affaires, tables séparées. */
export const FIN_SPACES = ["iac", "iaf"] as const;
export type FinSpace = (typeof FIN_SPACES)[number];

/** Préfixe des routes de l'API pour chaque espace ; IAT garde les routes historiques sans préfixe. */
export const SPACE_PREFIX: Record<Exclude<Space, "iat">, string> = { iap: "iap", iac: "iac", iaf: "iaf", iag: "groupe" };

/** Espace d'un chemin d'API (relatif à /api/v1) : `/iac/deals` → iac, `/groupe/partners` → iag, sinon iat. */
export function spaceOfPath(path: string): Space {
  for (const [space, prefix] of Object.entries(SPACE_PREFIX)) {
    if (path === `/${prefix}` || path.startsWith(`/${prefix}/`)) return space as Space;
  }
  return "iat";
}

/** Espaces d'un utilisateur : un administrateur a accès à tout ; sinon la liste enregistrée, IAT par défaut. */
export function userSpaces(role: string, stored: string | null | undefined): Space[] {
  if (role === "admin") return [...SPACE_CODES];
  const listed = parseSpaces(stored);
  return listed.length ? listed : ["iat"];
}

export function parseSpaces(value: unknown): Space[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  const wanted = new Set(items.map((s) => String(s).trim().toLowerCase()));
  return SPACE_CODES.filter((code) => wanted.has(code));
}
