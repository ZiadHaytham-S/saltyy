import Image from 'next/image';
import type { ReactNode } from 'react';
import type { PublicDesign, PublicSection } from '@sallty/contracts';
import { StoreHero, StoreVideo } from './store-design';

export function StoreSection({
  section,
  design,
  name,
  locale,
  products,
  categories,
}: {
  section: PublicSection;
  design: PublicDesign;
  name: string;
  locale: 'ar' | 'en';
  products: ReactNode;
  categories?: ReactNode;
}) {
  if (!section.enabled) return null;
  if (section.kind === 'products') return products;
  if (section.kind === 'categories')
    return design.categoriesVisible ? (
      <section>
        {section.title && (
          <h2 className="mb-4 text-xl font-bold">{section.title}</h2>
        )}
        {categories}
      </section>
    ) : null;
  if (section.kind === 'hero')
    return (
      <StoreHero
        name={name}
        locale={locale}
        buttonText={section.buttonText}
        buttonUrl={section.buttonUrl}
        design={{
          ...design,
          heading: section.title || design.heading,
          description: section.body || design.description,
          bannerUrl: section.imageUrl || design.bannerUrl,
        }}
      />
    );
  if (section.kind === 'video')
    return (
      <StoreVideo
        title={section.title}
        locale={locale}
        design={
          section.videoType === 'none'
            ? design
            : {
                ...design,
                videoType: section.videoType,
                videoUrl: section.videoUrl,
              }
        }
      />
    );
  return (
    <section
      className="store-content-section overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-10"
      style={{
        textAlign: section.alignment,
        backgroundColor: section.backgroundColor ?? undefined,
        color: section.textColor ?? undefined,
      }}
    >
      {section.imageUrl && (
        <div className="relative mb-6 aspect-[16/7] overflow-hidden rounded-xl">
          <Image
            src={section.imageUrl}
            alt={section.title}
            fill
            sizes="(max-width: 768px) 100vw, 80vw"
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      {section.title && (
        <h2 className="text-2xl font-bold sm:text-3xl">{section.title}</h2>
      )}
      {section.body && (
        <p className="mt-4 whitespace-pre-wrap leading-8">{section.body}</p>
      )}
      {section.buttonText && (
        <a
          className="mt-6 inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
          href={section.buttonUrl || '#products'}
          rel={section.buttonUrl ? 'noopener noreferrer' : undefined}
        >
          {section.buttonText}
        </a>
      )}
    </section>
  );
}
export function StoreSections({
  design,
  name,
  locale,
  products,
  categories,
}: {
  design?: PublicDesign;
  name: string;
  locale: 'ar' | 'en';
  products: ReactNode;
  categories?: ReactNode;
}) {
  if (!design?.customLayout && !design?.sections?.length)
    return (
      <>
        <StoreHero design={design} name={name} locale={locale} />
        {design?.videoPosition !== 'after-products' && (
          <StoreVideo design={design} locale={locale} />
        )}
        {products}
        {design?.videoPosition === 'after-products' && (
          <StoreVideo design={design} locale={locale} />
        )}
      </>
    );
  if (!design) return null;
  return (
    <div className="store-layout">
      {design.sections.map((section) => (
        <StoreSection
          key={section.id}
          section={section}
          design={design}
          name={name}
          locale={locale}
          products={products}
          categories={categories}
        />
      ))}
    </div>
  );
}
