const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

/** 453 330 882 → « 453,3 M » ; 4 500 000 → « 4,5 M » ; 655 000 → « 655 k ». */
export function compact(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${oneDecimal.format(value / 1e9)} Md`;
  if (abs >= 1e6) return `${oneDecimal.format(value / 1e6)} M`;
  if (abs >= 1e3) return `${integer.format(value / 1e3)} k`;
  return integer.format(value);
}

export function fcfa(value: number | null | undefined): string {
  return value == null ? "—" : `${integer.format(value)} FCFA`;
}

export function full(value: number | null | undefined): string {
  return value == null ? "—" : integer.format(value);
}

export function pct(value: number | null | undefined): string {
  return value == null ? "—" : percent.format(value);
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export function date(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const d = asDate(iso);
  return (withYear || d.getUTCFullYear() !== new Date().getUTCFullYear() ? dayYearFmt : dayFmt).format(d);
}

export function longDate(iso: string): string {
  const text = longFmt.format(asDate(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function month(iso: string): string {
  return monthFmt.format(asDate(iso)).replace(".", "");
}

export function dateTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** « aujourd'hui », « demain », « dans 4 j », « il y a 12 j ». */
export function relativeDays(days: number | null | undefined): string {
  if (days == null) return "";
  if (days === 0) return "aujourd’hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  return days > 0 ? `dans ${days} j` : `il y a ${-days} j`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
