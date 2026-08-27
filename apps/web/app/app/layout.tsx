import ClientAppLayout from './client-layout';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ClientAppLayout>{children}</ClientAppLayout>;
}
