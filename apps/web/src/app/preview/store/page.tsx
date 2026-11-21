import { buildStorePreview } from '@/components/store-preview-page';
export { metadata } from '@/components/store-preview-page';
export default async function PreviewPage() {
  return buildStorePreview(true);
}
