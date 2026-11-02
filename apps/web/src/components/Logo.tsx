import { useId } from "react";

/** Géométrie commune aux symboles du groupe Infinity Africa : deux bandes qui se croisent (∞). */
const BANDS = {
  left: "M93 110 L595 268 L595 480 L93 638 Z",
  right: "M1093 110 L590 268 L590 480 L1093 638 Z",
  leftEdge: "M93 110 L230 153 L230 595 L93 638 Z",
  rightEdge: "M1093 110 L955 153 L955 595 L1093 638 Z",
  cross: "M93 418 L1093 110 L1093 330 L93 638 Z",
};

/**
 * Symbole IAT redessiné en vectoriel d'après COMEX/logo/iat.png : deux bandes qui se croisent,
 * la bande arrière s'assombrissant vers le centre. Vert du symbole : #3B9E36.
 */
export function IatMark({ className, color = "#3B9E36" }: { className?: string; color?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="93 110 1000 528" role="img" aria-label="IAT">
      <defs>
        <linearGradient id={`l${id}`} x1="230" x2="595" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor="#062a07" />
        </linearGradient>
        <linearGradient id={`r${id}`} x1="955" x2="590" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor="#062a07" />
        </linearGradient>
      </defs>
      <path d={BANDS.left} fill={`url(#l${id})`} />
      <path d={BANDS.right} fill={`url(#r${id})`} />
      <path d={BANDS.leftEdge} fill={color} />
      <path d={BANDS.rightEdge} fill={color} />
      <path d={BANDS.cross} fill={color} />
    </svg>
  );
}

/**
 * Symbole IAP (Infinity Africa Properties), d'après la fiche de commissionnement : le même nœud,
 * en or dégradé, des bords cuivrés (#B7860F) vers un centre lumineux (#F4E04A).
 */
export function IapMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="93 110 1000 528" role="img" aria-label="IAP">
      <defs>
        <linearGradient id={`l${id}`} x1="93" x2="595" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B7860F" />
          <stop offset="1" stopColor="#F4E04A" />
        </linearGradient>
        <linearGradient id={`r${id}`} x1="1093" x2="590" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B7860F" />
          <stop offset="1" stopColor="#F4E04A" />
        </linearGradient>
        <linearGradient id={`d${id}`} x1="93" x2="1093" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C9971A" />
          <stop offset="0.5" stopColor="#F7E65C" />
          <stop offset="1" stopColor="#C9971A" />
        </linearGradient>
      </defs>
      <path d={BANDS.left} fill={`url(#l${id})`} />
      <path d={BANDS.right} fill={`url(#r${id})`} />
      <path d={BANDS.leftEdge} fill="#B07D12" />
      <path d={BANDS.rightEdge} fill="#B07D12" />
      <path d={BANDS.cross} fill={`url(#d${id})`} opacity={0.85} />
    </svg>
  );
}

/**
 * Logotype IAP : « I∞FINITY » au-dessus de « AFRICA PROPERTIES », texte dans la couleur courante
 * (noir sur fond clair, blanc en mode sombre), symbole en or.
 */
export function IapWordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark ${className ?? ""}`} role="img" aria-label="Infinity Africa Properties">
      <span className="wordmark-top" aria-hidden>
        I
        <IapMark />
        FINITY
      </span>
      <span className="wordmark-sub" aria-hidden>
        AFRICA PROPERTIES
      </span>
    </span>
  );
}

/** Symbole de la filiale. */
export function SpaceMark({ space, className }: { space: "iat" | "iap"; className?: string }) {
  return space === "iap" ? <IapMark className={className} /> : <IatMark className={className} />;
}
