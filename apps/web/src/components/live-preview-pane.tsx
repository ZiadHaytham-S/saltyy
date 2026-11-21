'use client';
import { useEffect, useRef, useState } from 'react';
import type { StoreDesign } from '@sallty/contracts';
import { useI18n } from './preferences';
export function LivePreviewPane({
  design,
  selected,
  onSelect,
  viewport,
  fullscreen = false,
}: {
  design: StoreDesign;
  selected: string | null;
  onSelect: (id: string) => void;
  viewport: 'desktop' | 'mobile';
  fullscreen?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600),
    { locale } = useI18n();
  const latest = useRef({ design, selected });
  function send() {
    frame.current?.contentWindow?.postMessage(
      {
        type: 'sallty-design-update',
        ...latest.current,
        theme: document.documentElement.dataset.theme,
      },
      location.origin,
    );
  }
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    latest.current = { design, selected };
    send();
  }, [design, selected]);
  useEffect(() => {
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === 'sallty-preview-ready') send();
      if (
        event.data?.type === 'sallty-preview-select' &&
        latest.current.design.sections.some(
          (section) => section.id === event.data.id,
        )
      )
        onSelect(event.data.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onSelect]);
  const frameWidth = viewport === 'mobile' ? 390 : 1280,
    scale = Math.min(1, width / frameWidth);
  return (
    <div
      ref={holder}
      className={
        fullscreen
          ? 'h-full w-full overflow-hidden bg-background'
          : 'overflow-hidden rounded-2xl border border-border bg-background'
      }
      data-testid="actual-live-preview"
      data-preview-viewport={viewport}
    >
      <div
        className="relative"
        style={{ height: fullscreen ? '100%' : 1000 * scale }}
      >
        <iframe
          key={locale}
          ref={frame}
          title={
            locale === 'ar'
              ? 'المتجر الفعلي — معاينة مباشرة'
              : 'Actual store — live preview'
          }
          src="/preview/store"
          sandbox="allow-same-origin allow-scripts"
          allow="fullscreen"
          onLoad={send}
          className="absolute top-0 border-0"
          style={{
            width: fullscreen ? '100%' : frameWidth,
            height: fullscreen ? '100%' : 1000,
            transform: fullscreen ? 'none' : `scale(${scale})`,
            transformOrigin: locale === 'ar' ? 'top right' : 'top left',
            insetInlineStart: 0,
          }}
        />
      </div>
    </div>
  );
}
