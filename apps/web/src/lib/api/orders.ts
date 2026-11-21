import 'server-only';
import { redirect, notFound } from 'next/navigation';
import type {
  MerchantOrder,
  OrderSummary,
  OrderQuery,
} from '@sallty/contracts';
import { request, requireMerchant } from './merchant';
async function read(path: string) {
  await requireMerchant();
  const response = await request(path);
  if (response.status === 401) redirect('/login');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Order service unavailable');
  return response.json() as Promise<unknown>;
}
export async function getOrders(query: OrderQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return (await read('/merchant/orders?' + params)) as {
    items: OrderSummary[];
    total: number;
    page: number;
    pageSize: number;
  };
}
export async function getOrder(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  return ((await read('/merchant/orders/' + id)) as { order: MerchantOrder })
    .order;
}
export async function getShipping() {
  return (await read('/merchant/shipping')) as {
    shippingFeePiastres: number | null;
    checkoutSupported: boolean;
  };
}
