/** Filiales gérées par l'application. Chaque espace a ses propres données et ses propres droits d'accès. */
export const SPACES = [
  { code: "iat", name: "IAT", full_name: "Infinity Africa Technologies" },
  { code: "iap", name: "IAP", full_name: "Infinity Africa Properties" },
] as const;

export type Space = (typeof SPACES)[number]["code"];
export const SPACE_CODES = SPACES.map((s) => s.code) as [Space, ...Space[]];

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
