import { z } from 'zod';
import { designDraftSchema } from '@sallty/contracts';
import { requireCatalog } from '@/lib/api/catalog';
import { request } from '@/lib/api/merchant';
import { getPublicStore } from '@/lib/api/storefront';
import { renderStorePage } from '@/components/store-page';
export const metadata = {
  title: 'معاينة خاصة | Private preview',
  robots: { index: false, follow: false },
};
export async function buildStorePreview(liveEditor = false) {
  const merchantStore = await requireCatalog();
  const [response, result] = await Promise.all([
    request('/merchant/design'),
    getPublicStore(merchantStore.slug),
  ]);
  if (!response.ok) throw new Error('Design preview unavailable');
  const { design } = z
    .strictObject({ design: designDraftSchema, version: z.number().int() })
    .parse(await response.json());
  const publicDesign = {
    ...design,
    bannerUrl: design.bannerId
      ? '/api/v1/merchant/media/' + design.bannerId
      : null,
    videoUrl:
      design.videoType === 'upload' && design.videoAssetId
        ? '/api/v1/merchant/videos/' + design.videoAssetId
        : design.videoUrl,
    sections: design.sections.map(({ imageId, videoAssetId, ...section }) => ({
      ...section,
      imageUrl: imageId ? '/api/v1/merchant/media/' + imageId : null,
      videoUrl:
        section.videoType === 'upload' && videoAssetId
          ? '/api/v1/merchant/videos/' + videoAssetId
          : section.videoUrl,
    })),
  };
  return renderStorePage(
    {
      params: Promise.resolve({ storeSlug: merchantStore.slug }),
      searchParams: Promise.resolve({}),
    },
    {
      ...result,
      store: {
        ...result.store,
        branding: {
          logoUrl: design.logoId
            ? '/api/v1/merchant/media/' + design.logoId
            : null,
          primaryColor: design.primaryColor,
        },
        design: publicDesign,
      },
    },
    liveEditor,
  );
}

export default async function PreviewPage() {
  return buildStorePreview(false);
}
