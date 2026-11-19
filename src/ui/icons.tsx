// Icônes dessinées à la main (trait arrondi, à la manière des symboles d'Apple) : aucune ressource externe.

import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const svg = (size: number, className: string | undefined, children: ReactNode, fill = false) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Pile de photos : onglet « Trier ». */
export const IconTrier = ({ size = 26, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <rect x="3.5" y="7" width="13.5" height="13.5" rx="3" />
      <path d="M7 4h10.5A3 3 0 0 1 20.5 7v10.5" />
      <path d="m6.5 17.5 3.2-3.6 2.4 2.4 1.6-1.7 1.8 2.9" />
    </>,
  );

/** Corbeille : onglet « Supprimer ». */
export const IconCorbeille = ({ size = 26, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7" />
      <path d="M6 6.5l.9 12.3c.1 1 .9 1.7 1.9 1.7h6.4c1 0 1.8-.7 1.9-1.7L18 6.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>,
  );

/** Roue dentée : onglet « Réglages ». */
export const IconReglages = ({ size = 26, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
    </>,
  );

export const IconCoche = ({ size = 14, className }: IconProps) =>
  svg(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={3} />);

export const IconCroix = ({ size = 14, className }: IconProps) =>
  svg(size, className, <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" strokeWidth={3} />);

export const IconPlus = ({ size = 18, className }: IconProps) => svg(size, className, <path d="M12 5v14M5 12h14" strokeWidth={2.4} />);

export const IconFermer = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M7 7l10 10M17 7 7 17" strokeWidth={2.4} />);

export const IconChevron = ({ size = 16, className }: IconProps) => svg(size, className, <path d="m9 5 7 7-7 7" strokeWidth={2.4} />);

/** Étoile pleine : la meilleure photo de sa pose. */
export const IconEtoile = ({ size = 12, className }: IconProps) =>
  svg(size, className, <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" />, true);

export const IconFleche = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M5 12h13M13 6l6 6-6 6" strokeWidth={2.2} />);

export const IconPartager = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M7 10.5H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </>,
  );

export const IconNuage = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.4A4.6 4.6 0 0 0 7 18.5z" />
      <path d="M12 16.5v-6M9.5 12.5 12 10l2.5 2.5" />
    </>,
  );
