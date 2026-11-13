import type { BadgeKind } from '../types';

interface BadgeIconProps {
  kind?: BadgeKind;
  className?: string;
}

export function BadgeIcon({ kind, className = 'w-4 h-4' }: BadgeIconProps) {
  if (!kind || kind === 'none') return null;
  const isOwner = kind === 'own';
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label={isOwner ? 'Owner verified badge' : 'Verified badge'}
      className={`inline-block shrink-0 align-middle ${
        isOwner
          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.55)]'
          : 'text-violet-400'
      } ${className}`}
    >
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="currentColor" />
      <path
        d="M8 12.2l2.7 2.7 5-5.4"
        fill="none"
        stroke="#09090F"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
