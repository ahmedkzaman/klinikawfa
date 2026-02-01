import { type LucideProps } from 'lucide-react';

export function KaabaIcon({ size = 24, strokeWidth = 2, className, ...props }: LucideProps) {
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
      {/* Main cube structure */}
      <rect x="4" y="6" width="16" height="14" rx="1" />
      {/* Top decorative band (Kiswah gold band) */}
      <line x1="4" y1="10" x2="20" y2="10" />
      {/* Door */}
      <rect x="10" y="14" width="4" height="6" />
      {/* Maqam Ibrahim marker */}
      <circle cx="8" cy="4" r="1.5" />
    </svg>
  );
}
