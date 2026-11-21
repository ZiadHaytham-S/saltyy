import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import {
  categoriesResponseSchema,
  productsResponseSchema,
  productSchema,
  mediaResponseSchema,
  type CatalogQuery,
} from '@sallty/contracts';
import { request, requireMerchant, getMerchantStore } from './merchant';
export async function requireCatalog() {
  await requireMerchant();
  const store = await getMerchantStore();
  if (!store) redirect('/onboarding/store');
  return store;
}
async function read(path: string) {
  const response = await request(path);
  if (response.status === 401) redirect('/login');
  if (response.status === 403) redirect('/verify-email');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Catalog API unavailable');
  return (await response.json()) as unknown;
}
export async function getCategories() {
  return categoriesResponseSchema.parse(await read('/merchant/categories'))
    .items;
}
export async function getMedia() {
  return mediaResponseSchema.parse(await read('/merchant/media')).items;
}
export async function getProduct(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  return z
    .object({ product: productSchema })
    .parse(await read('/merchant/products/' + id)).product;
}
export async function getProducts(query: CatalogQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return productsResponseSchema.parse(
    await read('/merchant/products?' + params),
  );
}
