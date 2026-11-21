import { cn } from '@/lib/utils';
export function SalltyLoader({
  className,
  label = 'Loading',
  decorative = false,
}: {
  className?: string;
  label?: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={cn(
        'sallty-loader inline-flex items-center justify-center',
        className,
      )}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className="size-full"
        aria-hidden="true"
      >
        <rect
          x="9"
          y="13"
          width="22"
          height="23"
          rx="6"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          className="sallty-loader-handle"
          d="M15 16V11a5 5 0 0 1 10 0v5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          className="sallty-loader-dot"
          cx="15"
          cy="25"
          r="1.7"
          fill="currentColor"
        />
        <circle
          className="sallty-loader-dot"
          cx="20"
          cy="25"
          r="1.7"
          fill="currentColor"
          style={{ animationDelay: '120ms' }}
        />
        <circle
          className="sallty-loader-dot"
          cx="25"
          cy="25"
          r="1.7"
          fill="currentColor"
          style={{ animationDelay: '240ms' }}
        />
      </svg>
    </span>
  );
}
