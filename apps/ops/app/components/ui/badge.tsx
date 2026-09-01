import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center rounded-sm border px-[7px] py-[3px] font-data text-[9.5px] font-semibold tracking-[0.1em] uppercase whitespace-nowrap',
  {
    variants: {
      variant: {
        ok: 'border-border text-muted-foreground bg-transparent',
        trial: 'border-trial text-trial bg-tint-trial',
        frozen: 'border-frozen text-frozen bg-tint-frozen',
        lost: 'border-lost text-lost bg-tint-lost line-through',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function statusBadgeVariant(status: string): VariantProps<typeof badgeVariants>['variant'] {
  const s = status.toUpperCase();
  if (['DECLINED', 'EXPIRED', 'CANCELLED'].includes(s)) return 'lost';
  if (s === 'FROZEN') return 'frozen';
  if (s === 'PENDING') return 'trial';
  if (s === 'ACTIVE') return 'ok';
  return 'trial';
}

export { Badge, badgeVariants };
