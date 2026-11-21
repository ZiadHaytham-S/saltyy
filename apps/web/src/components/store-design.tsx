import Image from 'next/image';
import type { CSSProperties } from 'react';
import { THEMES, youtubeId, type PublicDesign } from '@sallty/contracts';

function readableText(color: string) {
  const rgb = [1, 3, 5]
    .map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const bright = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]! > 0.179;
  return bright ? '#000000' : '#ffffff';
}
export function designStyle(design?: PublicDesign): CSSProperties {
  const color = design?.primaryColor ?? '#2563eb';
  return {
    '--store-accent': color,
    '--primary': color,
    '--primary-foreground': readableText(color),
    '--store-columns': design?.columns ?? 4,
    '--store-space':
      design?.spacing === 'compact'
        ? '1rem'
        : design?.spacing === 'spacious'
          ? '3rem'
          : '2rem',
    ...(design?.backgroundColor
      ? {
          '--background': design.backgroundColor,
          '--card': design.backgroundColor,
        }
      : {}),
    ...(design?.textColor
      ? { '--foreground': design.textColor }
      : design?.backgroundColor
        ? { '--foreground': readableText(design.backgroundColor) }
        : {}),
    fontFamily: design?.font === 'system' ? 'Arial, sans-serif' : undefined,
  } as CSSProperties;
}
export function StoreHero({
  design,
  name,
  locale,
  buttonText,
  buttonUrl,
}: {
  design?: PublicDesign;
  name: string;
  locale: 'ar' | 'en';
  buttonText?: string;
  buttonUrl?: string;
}) {
  if (design?.heroVisible === false) return null;
  const theme = THEMES.find((item) => item.id === design?.theme) ?? THEMES[0];
  return (
    <section
      className="store-hero relative mb-8 grid overflow-hidden rounded-[2rem] px-6 py-10 sm:px-12 sm:py-16"
      data-layout={theme.layout}
    >
      <div className="relative z-10 max-w-2xl">
        <p className="mb-5 text-sm">{name}</p>
        <h1 className="text-3xl font-bold leading-relaxed sm:text-5xl">
          {design?.heading ||
            (locale === 'ar'
              ? 'اختياراتنا، على ذوقك.'
              : 'Our selection. Your style.')}
        </h1>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-8 sm:text-base">
          {design?.description ||
            (locale === 'ar'
              ? 'تصفح منتجاتنا، واعرف كل التفاصيل والأسعار في مكان واحد.'
              : 'Explore our products, details and prices in one place.')}
        </p>
        <a
          className="store-hero-cta mt-8 inline-flex rounded-xl px-6 py-3 font-bold"
          href={buttonUrl || '#products'}
        >
          {buttonText ||
            (locale === 'ar' ? 'اكتشف المنتجات' : 'Explore products')}
        </a>
      </div>
      {design?.bannerUrl && (
        <div className="relative mt-8 min-h-64 overflow-hidden rounded-2xl sm:mt-0">
          <Image
            src={design.bannerUrl}
            alt={design.heading || name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            unoptimized
          />
        </div>
      )}
    </section>
  );
}
export function StoreVideo({
  design,
  locale,
  title,
}: {
  design?: PublicDesign;
  locale: 'ar' | 'en';
  title?: string;
}) {
  if (!design || design.videoType === 'none' || !design.videoUrl) return null;
  const id = youtubeId(design.videoUrl);
  return (
    <section className="my-8 overflow-hidden rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-4 text-lg font-bold">
        {title || (locale === 'ar' ? 'تعرّف على متجرنا' : 'Discover our store')}
      </h2>
      {design.videoType === 'youtube' && id ? (
        <iframe
          className="aspect-video w-full rounded-xl"
          src={'https://www.youtube-nocookie.com/embed/' + id}
          title={locale === 'ar' ? 'فيديو المتجر' : 'Store video'}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : ['custom', 'upload'].includes(design.videoType) ? (
        <video
          className="aspect-video w-full rounded-xl bg-black"
          src={design.videoUrl}
          controls
          preload="metadata"
          playsInline
        />
      ) : null}
    </section>
  );
}
export function StoreContact({
  design,
  locale,
}: {
  design?: PublicDesign;
  locale: 'ar' | 'en';
}) {
  if (!design) return null;
  const contact = design.contact;
  const links = [
    [
      'WhatsApp',
      contact.whatsapp ? 'https://wa.me/' + contact.whatsapp.slice(1) : '',
    ],
    ['Facebook', contact.facebook],
    ['Instagram', contact.instagram],
    ['TikTok', contact.tiktok],
    ['LinkedIn', contact.linkedin],
    ['Snapchat', contact.snapchat],
  ];
  return (
    <div className="w-full space-y-4 border-t border-border pt-5">
      <nav
        aria-label={locale === 'ar' ? 'تواصل مع المتجر' : 'Contact store'}
        className="flex flex-wrap gap-3"
      >
        {links
          .filter(([, url]) => url)
          .map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="rounded-full border border-border px-4 py-2 text-sm hover:text-primary"
            >
              {label}
            </a>
          ))}
      </nav>
      <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
        {contact.phone && (
          <a dir="ltr" href={'tel:' + contact.phone}>
            {contact.phone}
          </a>
        )}
        {contact.email && (
          <a href={'mailto:' + contact.email}>{contact.email}</a>
        )}
        {contact.address && (
          <p className="whitespace-pre-wrap">{contact.address}</p>
        )}
      </div>
    </div>
  );
}
