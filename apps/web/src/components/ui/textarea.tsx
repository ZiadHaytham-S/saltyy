import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'mt-2 flex min-h-32 w-full rounded-xl border border-input bg-transparent px-3 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-red-600',
        className,
      )}
      {...props}
    />
  );
}
