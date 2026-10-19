import { useId, useState } from "react";
import { compact, fcfa } from "../lib/format";
import { FLOW_STAGES, type Group } from "../lib/types";

const W = 1000;
const H = 190;
const MID = H / 2;
const MAX_HALF = 78;
const PLATEAU = 34;

/**
 * Le pipeline comme un ruban qui traverse les étapes M0 → M6 : son épaisseur à chaque étape est
 * proportionnelle au montant engagé (échelle linéaire), le ruban vire au vert à « Gagné ».
 * Les affaires non chiffrées gardent un trait fin : leur nombre est donné sous chaque étape.
 */
export function PipelineRibbon({ stages, onSelect }: { stages: Group[]; onSelect: (code: string) => void }) {
  const id = useId().replace(/:/g, "");
  const [hot, setHot] = useState<number | null>(null);
  const flow = FLOW_STAGES.map((s) => stages.find((g) => g.key === s.code) ?? { key: s.code, count: 0, amount: 0, weighted_amount: 0 } as Group);
  const max = Math.max(...flow.map((g) => g.amount), 1);
  const step = W / flow.length;
  const xs = flow.map((_, i) => (i + 0.5) * step);
  const half = flow.map((g) => (g.amount > 0 ? Math.max(4, (g.amount / max) * MAX_HALF) : g.count > 0 ? 1.6 : 0.8));

  // Demi-épaisseur en tout point : palier à chaque étape, raccord en interpolation douce entre deux étapes.
  const halfAt = (x: number) => {
    if (x <= xs[0]) return half[0];
    const last = xs.length - 1;
    if (x >= xs[last]) return half[last];
    const i = xs.findIndex((xi, k) => x >= xi && x < xs[k + 1]);
    const a = xs[i] + PLATEAU / 2;
    const b = xs[i + 1] - PLATEAU / 2;
    if (x <= a) return half[i];
    if (x >= b) return half[i + 1];
    const t = (x - a) / (b - a);
    return half[i] + (half[i + 1] - half[i]) * t * t * (3 - 2 * t);
  };
  const samples = Array.from({ length: W / 4 + 1 }, (_, k) => k * 4);
  const area =
    `M ${samples.map((x) => `${x} ${(MID - halfAt(x)).toFixed(2)}`).join(" L ")} L ` +
    `${[...samples].reverse().map((x) => `${x} ${(MID + halfAt(x)).toFixed(2)}`).join(" L ")} Z`;

  const wonStart = (xs[5] + PLATEAU / 2) / W;
  const wonEnd = (xs[6] - PLATEAU / 2) / W;
  const g = hot != null ? flow[hot] : null;

  return (
    <div className="ribbon" onMouseLeave={() => setHot(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Montants engagés à chaque étape du pipeline, de M0 à M6">
        <defs>
          <linearGradient id={`rg${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--blue)" stopOpacity="0.55" />
            <stop offset={xs[2] / W} stopColor="var(--blue)" stopOpacity="0.8" />
            <stop offset={wonStart} stopColor="var(--blue)" />
            <stop offset={wonEnd} stopColor="var(--green)" />
            <stop offset="1" stopColor="var(--green)" />
          </linearGradient>
        </defs>
        <g className="band">
          <path d={area} fill={`url(#rg${id})`} />
        </g>
        {xs.map((x, i) => (
          <g key={i}>
            <line x1={x} x2={x} y1={10} y2={H - 10} stroke="var(--hairline-strong)" strokeDasharray="2 4" opacity={hot === i ? 1 : 0} />
            <rect
              x={i * step}
              y={0}
              width={step}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHot(i)}
              onClick={() => onSelect(flow[i].key)}
              style={{ cursor: "pointer" }}
            />
          </g>
        ))}
      </svg>
      {g && hot != null && (
        <div className="ribbon-tip" style={{ left: `${((hot + 0.5) / flow.length) * 100}%`, top: 6 }}>
          <strong>{FLOW_STAGES[hot].label}</strong>
          <dl>
            <dt>Affaires</dt>
            <dd className="num">{g.count}</dd>
            <dt>Montant</dt>
            <dd className="num">{fcfa(g.amount)}</dd>
            <dt>Pondéré</dt>
            <dd className="num">{fcfa(g.weighted_amount)}</dd>
          </dl>
        </div>
      )}
      <div className="ribbon-cols">
        {flow.map((stage, i) => (
          <button
            key={stage.key}
            type="button"
            className={`ribbon-col${hot === i ? " hot" : ""}${stage.amount ? "" : " unvalued"}`}
            onMouseEnter={() => setHot(i)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            onClick={() => onSelect(stage.key)}
            aria-label={`${FLOW_STAGES[i].label} : ${stage.count} affaires, ${fcfa(stage.amount)}`}
          >
            <span className="stage-code">{FLOW_STAGES[i].code}</span>
            <span className="name">{FLOW_STAGES[i].short}</span>
            <span className="amt num">{stage.amount ? compact(stage.amount) : "Non chiffré"}</span>
            <span className="cnt">
              {stage.count} affaire{stage.count > 1 ? "s" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
