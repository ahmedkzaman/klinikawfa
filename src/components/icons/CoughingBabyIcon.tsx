import { type LucideProps } from 'lucide-react';

export function CoughingBabyIcon({ size = 24, strokeWidth = 2, className, ...props }: LucideProps) {
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
      {/* Baby head */}
      <circle cx="10" cy="10" r="7" />
      {/* Left eye */}
      <circle cx="8" cy="9" r="0.5" fill="currentColor" />
      {/* Right eye (squinting) */}
      <line x1="11" y1="9" x2="13" y2="9" />
      {/* Open mouth (coughing) */}
      <ellipse cx="10" cy="13" rx="2" ry="1.5" />
      {/* Cough lines */}
      <path d="M17 10 L19 9" />
      <path d="M17 12 L20 12" />
      <path d="M17 14 L19 15" />
      {/* Small hair tuft */}
      <path d="M7 4 C6 2, 8 2, 7 4" />
      <path d="M10 3 C9 1, 11 1, 10 3" />
    </svg>
  );
}
