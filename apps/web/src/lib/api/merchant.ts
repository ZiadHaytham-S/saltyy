import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authResponseSchema, storeResponseSchema } from '@sallty/contracts';
export async function request(path: string) {
  const jar = await cookies();
  const cookie = ['sallty_session', '__Host-sallty_session']
    .map((key) => jar.get(key))
    .filter((item) => item !== undefined)
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');
  return fetch(
    (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000') + path,
    {
      headers: { Cookie: cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    },
  );
}
export async function getMerchant() {
  const response = await request('/auth/me');
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Merchant API unavailable');
  return authResponseSchema.parse(await response.json()).user;
}
export async function requireMerchant() {
  const merchant = await getMerchant();
  if (!merchant) redirect('/login');
  if (!merchant.emailVerified) redirect('/verify-email');
  return merchant;
}
export async function getMerchantStore() {
  const response = await request('/merchant/store');
  if (response.status === 401) redirect('/login');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Store API unavailable');
  return storeResponseSchema.parse(await response.json()).store;
}
