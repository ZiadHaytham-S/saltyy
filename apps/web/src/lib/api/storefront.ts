import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  publicSlugSchema,
  publicStoreResponseSchema,
  publicProductsResponseSchema,
  publicProductSchema,
  storefrontQuerySchema,
  moneyToMinor,
  minorToInput,
  type Currency,
  type StorefrontQuery,
} from '@sallty/contracts';
async function read(path: string) {
  const response = await fetch(
    (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000') +
      '/public/stores/' +
      path,
    { cache: 'no-store', signal: AbortSignal.timeout(5000) },
  );
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error('Storefront unavailable');
  return (await response.json()) as unknown;
}
export { storePath } from '../storefront-routes';
export const getPublicStore = cache(async (slug: string) => {
  if (!publicSlugSchema.safeParse(slug).success) notFound();
  return publicStoreResponseSchema.parse(await read(slug));
});
export const getPublicProduct = cache(async (slug: string, product: string) => {
  if (
    !publicSlugSchema.safeParse(slug).success ||
    !publicSlugSchema.safeParse(product).success
  )
    notFound();
  return z
    .strictObject({ product: publicProductSchema })
    .parse(await read(slug + '/products/' + product)).product;
});
export async function getPublicProducts(slug: string, query: StorefrontQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return publicProductsResponseSchema.parse(
    await read(slug + '/products?' + params),
  );
}
export function parsePublicQuery(
  query: Record<string, string | string[] | undefined>,
  currency: Currency = 'EGP',
) {
  const values = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
  );
  for (const [browserKey, apiKey] of [
    ['minEGP', 'minPrice'],
    ['maxEGP', 'maxPrice'],
  ]) {
    if (browserKey && apiKey && values[browserKey] !== undefined) {
      const value = values[browserKey];
      try {
        values[apiKey] =
          typeof value === 'string'
            ? String(
                /^0(?:\.0{1,3})?$/.test(value)
                  ? 0
                  : moneyToMinor(value, currency),
              )
            : value;
      } catch {
        values[apiKey] = 'invalid';
      }
      delete values[browserKey];
    }
  }
  return storefrontQuerySchema.safeParse(values);
}
export function publicQueryParams(
  query: StorefrontQuery,
  currency: Currency = 'EGP',
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') {
      params.set(
        key === 'minPrice' ? 'minEGP' : key === 'maxPrice' ? 'maxEGP' : key,
        (key === 'minPrice' || key === 'maxPrice') && typeof value === 'number'
          ? minorToInput(value, currency)
          : String(value),
      );
    }
  return params;
}
