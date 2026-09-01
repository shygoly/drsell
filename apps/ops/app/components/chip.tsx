import { Badge, statusBadgeVariant } from '@/app/components/ui/badge';

export function chipClass(status: string) {
  const v = statusBadgeVariant(status);
  return `inline-flex ${v}`;
}

export function Chip({ status }: { status: string }) {
  return <Badge variant={statusBadgeVariant(status)}>{status}</Badge>;
}
