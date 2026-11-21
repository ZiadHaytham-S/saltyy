import { requireMerchant, getMerchantStore } from '@/lib/api/merchant';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { redirect } from 'next/navigation';
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireMerchant(),
    store = await getMerchantStore();
  if (!store) redirect('/onboarding/store');
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <DashboardSidebar storeSlug={store?.slug} admin={user.role === 'ADMIN'} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
