import type { SVGProps } from "react";

/* Icônes dessinées pour l'application : grille de 20, trait de 1,6, extrémités arrondies. */

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconOverview = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 13.5a7 7 0 1 1 14 0" />
    <path d="M10 13.5l3.2-4.2" />
    <circle cx="10" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
export const IconDeals = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 6h14M5 10h10M7.5 14h5" />
  </svg>
);
export const IconAccounts = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 17V4.8c0-.4.3-.8.8-.8h6.4c.5 0 .8.4.8.8V17" />
    <path d="M12 8.5h3.2c.5 0 .8.4.8.8V17M2.5 17h15" />
    <path d="M6.5 7.5h3M6.5 10.5h3M6.5 13.5h3" />
  </svg>
);
export const IconRenewals = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 9.5A6 6 0 0 0 5.2 6M4 10.5A6 6 0 0 0 14.8 14" />
    <path d="M5 3v3.2h3.2M15 17v-3.2h-3.2" />
  </svg>
);
export const IconActions = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5" cy="6" r="1.8" />
    <circle cx="5" cy="14" r="1.8" />
    <path d="M9.5 6H17M9.5 14H17" />
  </svg>
);
export const IconSolutions = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 2.8l6.4 3.4v7.6L10 17.2l-6.4-3.4V6.2z" />
    <path d="M3.8 6.3L10 9.7l6.2-3.4M10 9.7v7.3" />
  </svg>
);
export const IconTenders = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 2.8h6.5L15 6.3v10.1c0 .5-.4.8-.8.8H5.8c-.5 0-.8-.3-.8-.8V3.6c0-.4.3-.8.8-.8z" />
    <path d="M11.2 3v3.5H15M7.5 10.5h5M7.5 13.5h3.5" />
  </svg>
);
export const IconContacts = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17c.8-3 3.3-4.8 6.2-4.8s5.4 1.8 6.2 4.8" />
  </svg>
);
export const IconActivity = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.3l2.8 1.7" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8.8" cy="8.8" r="5.3" />
    <path d="M12.8 12.8L17 17" />
  </svg>
);
export const IconChevron = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7.5 4.5L13 10l-5.5 5.5" />
  </svg>
);
export const IconBack = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12.5 4.5L7 10l5.5 5.5" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);
export const IconCopy = (p: P) => (
  <svg {...base} {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
    <path d="M13 7V4.8c0-.4-.4-.8-.8-.8H4.8c-.4 0-.8.4-.8.8v7.4c0 .4.4.8.8.8H7" />
  </svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 6.5h13M3.5 13.5h13" />
  </svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 3.5H5c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h3M12.5 13.5L16 10l-3.5-3.5M16 10H8" />
  </svg>
);
export const IconWarning = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 3.2l7.3 12.6H2.7z" />
    <path d="M10 8.2v3.6" />
    <circle cx="10" cy="13.9" r=".5" fill="currentColor" />
  </svg>
);
/* Étincelle : marque des modifications faites via Claude */
export const IconSpark = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M4.7 4.7l2.6 2.6M12.7 12.7l2.6 2.6M15.3 4.7l-2.6 2.6M7.3 12.7l-2.6 2.6" />
  </svg>
);
export const IconGrid = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3.5" width="4" height="13" rx="1.2" />
    <rect x="8" y="3.5" width="4" height="9" rx="1.2" />
    <rect x="13" y="3.5" width="4" height="6" rx="1.2" />
  </svg>
);
export const IconList = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 5h13M3.5 10h13M3.5 15h13" />
  </svg>
);

/* Pictogrammes de statut, pleins, lisibles sans la couleur */
export const MarkGood = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden {...p}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const MarkWarn = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden {...p}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M8 4.4v4.3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="8" cy="11.3" r="1" fill="#fff" />
  </svg>
);
export const MarkBad = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden {...p}>
    <path d="M8 1.2l6.9 12.2H1.1z" fill="currentColor" strokeLinejoin="round" />
    <path d="M8 5.6v3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="8" cy="11.4" r=".95" fill="#fff" />
  </svg>
);
export const MarkInfo = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden {...p}>
    <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 4.8V8l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const MarkNone = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden {...p}>
    <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.2" />
  </svg>
);
