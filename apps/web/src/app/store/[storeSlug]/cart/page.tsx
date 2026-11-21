import type { Metadata } from 'next';
import { getPublicStore } from '@/lib/api/storefront';
import { StoreShell } from '@/components/storefront';
import { CartPageContent } from '@/components/cart';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function CartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params,
    { store } = await getPublicStore(storeSlug);
  return (
    <StoreShell store={store}>
      <CartPageContent slug={store.slug} />
    </StoreShell>
  );
}
