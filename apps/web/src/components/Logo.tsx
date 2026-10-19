import { useId } from "react";

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
      <path d="M93 110 L595 268 L595 480 L93 638 Z" fill={`url(#l${id})`} />
      <path d="M1093 110 L590 268 L590 480 L1093 638 Z" fill={`url(#r${id})`} />
      <path d="M93 110 L230 153 L230 595 L93 638 Z" fill={color} />
      <path d="M1093 110 L955 153 L955 595 L1093 638 Z" fill={color} />
      <path d="M93 418 L1093 110 L1093 330 L93 638 Z" fill={color} />
    </svg>
  );
}
