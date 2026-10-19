import { useState } from "react";
import { MarkBad, MarkGood, MarkInfo, MarkNone, MarkWarn } from "../components/icons";
import { renewalTone, type Tone } from "../components/ui";
import { compact, date, month } from "../lib/format";
import type { Renewal } from "../lib/types";

const W = 1000;
const LABEL_W = 270;
const ROW_H = 58;
const AXIS_H = 46;
const TONE_COLOR: Record<Tone, string> = {
  bad: "var(--red)",
  warn: "var(--amber)",
  info: "var(--blue)",
  good: "var(--green)",
  none: "var(--neutral-mark)",
};
const MARK = { bad: MarkBad, warn: MarkWarn, info: MarkInfo, good: MarkGood, none: MarkNone };

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const DAY = 86_400_000;

/**
 * Échéancier des contrats récurrents : pour chaque contrat, la fenêtre de relance (J-90 → échéance),
 * le repère J-30 et l'échéance elle-même. La ligne verticale marque aujourd'hui.
 */
export function RenewalTimeline({ renewals, today, onSelect }: { renewals: Renewal[]; today: string; onSelect: (r: Renewal) => void }) {
  const [hot, setHot] = useState<number | null>(null);
  const dated = renewals.filter((r) => r.due_date);
  const times = [toTime(today), ...dated.flatMap((r) => [toTime(r.due_date!), toTime(r.reminder_90!)])];
  const start = new Date(Math.min(...times) - 30 * DAY);
  start.setUTCDate(1);
  const end = Math.max(...times) + 45 * DAY;
  const x = (iso: string) => LABEL_W + ((toTime(iso) - start.getTime()) / (end - start.getTime())) * (W - LABEL_W - 16);
  const height = AXIS_H + renewals.length * ROW_H + 30;
  const rowsEnd = AXIS_H + renewals.length * ROW_H + 6;

  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end) {
    months.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <div className="timeline">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Échéancier des renouvellements : fenêtres de relance et échéances">
        {months.map((m, i) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={AXIS_H - 8} y2={rowsEnd} stroke="var(--hairline)" />
            {(months.length <= 14 || i % 2 === 0) && (
              <text x={x(m) + 4} y={AXIS_H - 14} fontSize="11.5" fill="var(--ink-3)">
                {month(m)}
              </text>
            )}
            {(i === 0 || m.slice(5, 7) === "01") && (
              <text x={x(m) + 4} y={14} fontSize="11.5" fontWeight="650" fill="var(--ink-2)">
                {m.slice(0, 4)}
              </text>
            )}
          </g>
        ))}
        {renewals.map((r, i) => {
          const y = AXIS_H + i * ROW_H;
          const cy = y + ROW_H / 2;
          const tone = renewalTone(r.alert);
          const color = TONE_COLOR[tone];
          return (
            <g
              key={r.id}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              onClick={() => onSelect(r)}
              style={{ cursor: "pointer" }}
            >
              <rect x={0} y={y} width={W} height={ROW_H} rx={10} fill={hot === i ? "var(--surface-2)" : "transparent"} />
              <text x={8} y={cy - 4} fontSize="13.5" fontWeight="600" fill="var(--ink)">
                {r.account_name}
              </text>
              <text x={8} y={cy + 14} fontSize="12" fill="var(--ink-3)">
                {r.contract.length > 30 ? `${r.contract.slice(0, 29)}…` : r.contract} · {compact(r.last_amount)}
              </text>
              {r.due_date ? (
                <>
                  <line x1={LABEL_W} x2={W - 16} y1={cy} y2={cy} stroke="var(--hairline-strong)" />
                  <rect
                    x={x(r.reminder_90!)}
                    y={cy - 7}
                    width={Math.max(2, x(r.due_date) - x(r.reminder_90!))}
                    height={14}
                    rx={4}
                    fill={color}
                    opacity={0.18}
                  />
                  <line x1={x(r.reminder_30!)} x2={x(r.reminder_30!)} y1={cy - 7} y2={cy + 7} stroke={color} strokeWidth={2} />
                  <rect x={x(r.due_date) - 6} y={cy - 6} width={12} height={12} rx={2} transform={`rotate(45 ${x(r.due_date)} ${cy})`} fill={color} stroke="var(--surface)" strokeWidth={2} />
                  <text
                    x={x(r.due_date) > W - 120 ? x(r.reminder_90!) - 8 : x(r.due_date) + 14}
                    y={cy + 4}
                    textAnchor={x(r.due_date) > W - 120 ? "end" : "start"}
                    fontSize="12"
                    fontWeight="560"
                    fill="var(--ink-2)"
                  >
                    {date(r.due_date, true)}
                  </text>
                </>
              ) : (
                <text x={LABEL_W + 4} y={cy + 4} fontSize="12.5" fill="var(--ink-3)">
                  Échéance à confirmer : renseigner la date de facturation
                </text>
              )}
              <title>{`${r.account_name} — ${r.contract} : ${r.alert}${r.due_date ? `, échéance le ${date(r.due_date, true)}` : ""}`}</title>
            </g>
          );
        })}
        <line x1={x(today)} x2={x(today)} y1={AXIS_H - 8} y2={rowsEnd} stroke="var(--ink)" strokeWidth={1.5} />
        <text x={x(today)} y={rowsEnd + 16} textAnchor="middle" fontSize="11.5" fontWeight="650" fill="var(--ink)">
          Aujourd’hui
        </text>
      </svg>
      <div className="legend">
        {(["bad", "warn", "info", "none"] as Tone[]).map((tone) => {
          const Mark = MARK[tone];
          return (
            <span key={tone}>
              <Mark style={{ color: TONE_COLOR[tone] }} />
              {{ bad: "Échu", warn: "À relancer sous 90 jours", info: "À venir", none: "Date à confirmer", good: "Renouvelé" }[tone]}
            </span>
          );
        })}
        <span>Bande : fenêtre de relance J-90 → échéance ; trait : J-30</span>
      </div>
    </div>
  );
}
