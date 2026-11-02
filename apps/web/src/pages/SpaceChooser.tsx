import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, Navigate } from "react-router";
import { IatMark, IapWordmark, SpaceMark } from "../components/Logo";
import { APP_NAME } from "../components/Shell";
import { api, useApi } from "../lib/api";
import { compact, longDate } from "../lib/format";
import { useMe } from "../lib/me";
import { applySpaceTheme, lastSpace, SPACE_LIST, type SpaceCode } from "../lib/space";
import type { IapSummary, Summary } from "../lib/types";

/** Deux ou trois chiffres de l'espace, pour choisir en connaissance de cause. */
function Figures({ space }: { space: SpaceCode }) {
  const { data: iat } = useApi<Summary>(space === "iat" ? "/summary" : null);
  const { data: iap } = useApi<IapSummary>(space === "iap" ? "/iap/summary" : null);
  const figures =
    space === "iat"
      ? iat && [
          { value: compact(iat.pipeline.total_amount), label: "FCFA en jeu" },
          { value: String(iat.pipeline.deals_count), label: "affaires" },
          { value: String(iat.pipeline.overdue_actions_count), label: "actions en retard", alert: iat.pipeline.overdue_actions_count > 0 },
        ]
      : iap && [
          { value: compact(iap.pipeline.open_amount), label: "FCFA de biens en portefeuille" },
          { value: String(iap.pipeline.mandates_signed_count), label: "mandats signés" },
          { value: compact(iap.pipeline.open_commission), label: "FCFA de commissions attendues" },
        ];
  return (
    <dl className="space-card-figures">
      {(figures || [0, 1, 2].map(() => null)).map((f, i) => (
        <div key={i}>
          <dt className={`num${f?.alert ? " alert" : ""}`}>{f ? f.value : "—"}</dt>
          <dd>{f ? f.label : " "}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Écran d'accueil après connexion : choisir l'espace de travail (IAT ou IAP). Chaque carte porte les
 * couleurs de sa filiale ; le dernier espace utilisé est signalé et reçoit le focus clavier.
 */
export function SpaceChooser() {
  const me = useMe();
  const client = useQueryClient();
  const spaces = SPACE_LIST.filter((s) => me.user.spaces.includes(s.code));
  const last = lastSpace();
  useEffect(() => applySpaceTheme(null), []);

  if (spaces.length === 1) return <Navigate to={spaces[0].base} replace />;
  const firstName = me.user.name.split(" ")[0];

  const logout = async () => {
    await api.post("/auth/logout", {});
    client.clear();
    window.location.assign("/connexion");
  };

  return (
    <div className="chooser">
      <header className="chooser-head">
        <span className="chooser-app">{APP_NAME}</span>
        <button type="button" className="btn btn-plain" onClick={logout}>
          Se déconnecter
        </button>
      </header>
      <main className="chooser-main">
        <div className="t-caption">{longDate(me.today)}</div>
        <h1 className="t-title chooser-title">Bonjour {firstName}, quel espace ouvrir ?</h1>
        <p className="lede">Vous pourrez passer de l’un à l’autre à tout moment depuis le logo, en haut à gauche.</p>
        <div className="space-cards">
          {spaces.map((s) => (
            <Link
              key={s.code}
              to={s.base}
              className={`space-card ${s.code}`}
              autoFocus={s.code === (last ?? spaces[0].code)}
              aria-label={`Ouvrir l’espace ${s.name}, ${s.fullName}`}
            >
              <div className="space-card-art" aria-hidden>
                {s.code === "iap" ? <IapWordmark className="on-dark" /> : <IatMark className="space-card-mark" />}
                {last === s.code && <span className="space-card-last">Dernier espace utilisé</span>}
              </div>
              <div className="space-card-body">
                <div className="space-card-name">
                  <SpaceMark space={s.code} className="space-card-icon" />
                  <span>
                    <strong>{s.name}</strong> · {s.fullName}
                  </span>
                </div>
                <p>{s.tagline}</p>
                <Figures space={s.code} />
                <span className="space-card-go">Ouvrir l’espace {s.name} →</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
