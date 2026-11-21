import { z } from 'zod';
import { designDraftSchema } from '@sallty/contracts';
import { requireCatalog, getMedia, getProducts } from '@/lib/api/catalog';
import { request } from '@/lib/api/merchant';
import { DesignEditor } from '@/components/design-editor';

export default async function DesignPage() {
  const store = await requireCatalog();
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
    <DesignEditor
      fullscreen
      initial={data.design}
      version={data.version}
      name={store.name}
      media={media}
      products={products.items}
      videos={videos}
    />
  );
}
