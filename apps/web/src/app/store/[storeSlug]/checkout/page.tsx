import type { Metadata } from 'next';
import { getPublicStore } from '@/lib/api/storefront';
import { StoreShell } from '@/components/storefront';
import { CheckoutForm } from '@/components/checkout';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params,
    { store } = await getPublicStore(storeSlug);
  return (
    <StoreShell store={store}>
      <CheckoutForm slug={store.slug} />
    </StoreShell>
  );
}
