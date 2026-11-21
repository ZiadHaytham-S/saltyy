'use server';
import { revalidatePath } from 'next/cache';
import { requireCatalog } from './catalog';
// REST mutations belong to NestJS. This action only invalidates Next's route cache.
export async function invalidateCatalog() {
  await requireCatalog();
  revalidatePath('/dashboard/products');
  revalidatePath('/dashboard/products/new');
  revalidatePath('/dashboard/products/[id]/edit', 'page');
  revalidatePath('/dashboard/categories');
}
