import type { Metadata } from 'next';
import { getPublicStore } from '@/lib/api/storefront';
import { StoreShell } from '@/components/storefront';
import { OrderConfirmation } from '@/components/checkout';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params,
    { store } = await getPublicStore(storeSlug);
  return (
    <StoreShell store={store}>
      <OrderConfirmation slug={store.slug} />
    </StoreShell>
  );
}
