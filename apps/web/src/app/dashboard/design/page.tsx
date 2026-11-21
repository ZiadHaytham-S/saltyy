import { z } from 'zod';
import { designDraftSchema } from '@sallty/contracts';
import { requireCatalog, getMedia, getProducts } from '@/lib/api/catalog';
import { request } from '@/lib/api/merchant';
import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { DesignEditor } from '@/components/design-editor';

export default async function DesignPage() {
  const store = await requireCatalog(),
    { locale } = await getI18n();
  const [response, media, products, videoResponse] = await Promise.all([
    request('/merchant/design'),
    getMedia(),
    getProducts({ page: 1, pageSize: 4 }),
    request('/merchant/videos'),
  ]);
  if (!response.ok) throw new Error('Design service unavailable');
  const data = z
    .strictObject({
      design: designDraftSchema,
      version: z.number().int().min(0),
    })
    .parse(await response.json());
  if (!videoResponse.ok) throw new Error('Video service unavailable');
  const videos = z
    .strictObject({
      items: z.array(
        z.strictObject({ id: z.string(), bytes: z.number().int() }),
      ),
    })
    .parse(await videoResponse.json()).items;
  return (
    <MerchantShell
      title={locale === 'ar' ? 'تصميم المتجر' : 'Store design'}
      description={
        locale === 'ar'
          ? 'ثيمات جاهزة وهوية ومحتوى قابل للتخصيص.'
          : 'Ready-made themes, identity and customizable content.'
      }
      wide
    >
      <DesignEditor
        initial={data.design}
        version={data.version}
        name={store.name}
        media={media}
        products={products.items}
        videos={videos}
      />
    </MerchantShell>
  );
}
