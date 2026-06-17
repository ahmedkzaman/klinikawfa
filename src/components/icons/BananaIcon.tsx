import { type LucideProps } from 'lucide-react';

export function BananaIcon({ size = 24, strokeWidth = 2, className, ...props }: LucideProps) {
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
      {/* Banana curved body */}
      <path d="M4 13 C4 8, 8 4, 14 4 C18 4, 20 6, 21 8" />
      <path d="M4 13 C4 18, 8 21, 14 20 C18 19, 20 16, 21 12" />
      {/* Stem */}
      <path d="M21 8 C22 7, 22 6, 21 5" />
      {/* Inner curve detail */}
      <path d="M6 13 C6 10, 9 7, 14 7" />
    </svg>
  );
}
