import { type LucideProps } from 'lucide-react';

export function MosquitoIcon({ size = 24, strokeWidth = 2, className, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Body */}
      <ellipse cx="12" cy="14" rx="3" ry="5" />
      {/* Head */}
      <circle cx="12" cy="7" r="2" />
      {/* Proboscis (needle) */}
      <line x1="12" y1="5" x2="12" y2="2" />
      {/* Left wing */}
      <path d="M9 12 C5 10, 4 7, 5 5" />
      {/* Right wing */}
      <path d="M15 12 C19 10, 20 7, 19 5" />
      {/* Left legs */}
      <line x1="9" y1="14" x2="5" y2="16" />
      <line x1="9" y1="16" x2="5" y2="19" />
      {/* Right legs */}
      <line x1="15" y1="14" x2="19" y2="16" />
      <line x1="15" y1="16" x2="19" y2="19" />
    </svg>
  );
}
