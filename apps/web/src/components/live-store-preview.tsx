'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  designDraftSchema,
  type PublicDesign,
  type PublicStore,
} from '@sallty/contracts';
import { StoreFrame } from './store-frame';
import { StoreSection } from './store-sections';
import { sectionLabel } from './section-editor';

export function LiveStorePreview({
  store,
  locale,
  products,
  categories,
}: {
  store: PublicStore;
  locale: 'ar' | 'en';
  products: ReactNode;
  categories?: ReactNode;
}) {
  const [design, setDesign] = useState(store.design),
    [logoUrl, setLogoUrl] = useState(store.branding.logoUrl),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== 'sallty-design-update'
      )
        return;
      const parsed = designDraftSchema.safeParse(event.data.design);
      if (!parsed.success) return;
      document.documentElement.dataset.theme =
        event.data.theme === 'dark' ? 'dark' : 'light';
      const { logoId, bannerId, videoAssetId, ...value } = parsed.data;
      const current: PublicDesign = {
        ...value,
        customLayout: true,
        bannerUrl: bannerId ? '/api/v1/merchant/media/' + bannerId : null,
        videoUrl:
          value.videoType === 'upload' && videoAssetId
            ? '/api/v1/merchant/videos/' + videoAssetId
            : value.videoUrl,
        sections: value.sections.map(
          ({ imageId, videoAssetId, ...section }) => ({
            ...section,
            imageUrl: imageId ? '/api/v1/merchant/media/' + imageId : null,
            videoUrl:
              section.videoType === 'upload' && videoAssetId
                ? '/api/v1/merchant/videos/' + videoAssetId
                : section.videoUrl,
          }),
        ),
      };
      setDesign(current);
      setLogoUrl(logoId ? '/api/v1/merchant/media/' + logoId : null);
      setSelected(
        typeof event.data.selected === 'string' ? event.data.selected : null,
      );
    }
    window.addEventListener('message', receive);
    window.parent.postMessage(
      { type: 'sallty-preview-ready' },
      location.origin,
    );
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    const title = design?.sections.find(
      (section) => section.kind === 'products',
    )?.title;
    const heading = document.querySelector('#products h2');
    if (heading)
      heading.textContent =
        title || (locale === 'ar' ? 'منتجاتنا' : 'Our products');
  }, [design, locale]);
  if (!design) return null;
  return (
    <div
      onClickCapture={(event) => {
        if ((event.target as Element).closest('a')) event.preventDefault();
      }}
    >
      <StoreFrame
        store={{ ...store, branding: { ...store.branding, logoUrl }, design }}
        locale={locale}
      >
        <div className="store-layout">
          {design.sections.map((section) => (
            <div
              key={section.id}
              data-live-section={section.id}
              className={
                'relative rounded-xl border-2 ' +
                (selected === section.id
                  ? 'border-primary'
                  : 'border-transparent')
              }
            >
              <button
                type="button"
                className="absolute inset-0 z-20 rounded-xl border-2 border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
                aria-label={
                  (locale === 'ar' ? 'تعديل قسم ' : 'Edit section ') +
                  sectionLabel(section.kind, locale)
                }
                onClick={() =>
                  window.parent.postMessage(
                    { type: 'sallty-preview-select', id: section.id },
                    location.origin,
                  )
                }
              />
              <StoreSection
                section={section}
                design={design}
                name={store.name}
                locale={locale}
                products={products}
                categories={categories}
              />
              {section.kind === 'video' &&
                section.videoType === 'none' &&
                design.videoType === 'none' && (
                  <p className="rounded-xl bg-muted p-8">
                    {locale === 'ar'
                      ? 'اختر فيديو لهذا القسم'
                      : 'Choose a video for this section'}
                  </p>
                )}
              {!section.enabled && (
                <p className="rounded-xl bg-muted p-4 text-sm">
                  {sectionLabel(section.kind, locale)} —{' '}
                  {locale === 'ar'
                    ? 'مخفي عن العملاء'
                    : 'Hidden from customers'}
                </p>
              )}
            </div>
          ))}
        </div>
      </StoreFrame>
    </div>
  );
}
