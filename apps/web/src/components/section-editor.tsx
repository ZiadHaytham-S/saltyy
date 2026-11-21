'use client';
import { useState, useEffect, useRef } from 'react';
import {
  sectionSchema,
  type StoreDesign,
  type DesignSection,
  type Media,
} from '@sallty/contracts';
import { useI18n } from './preferences';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select } from './ui/select';

export const sectionLabel = (
  kind: DesignSection['kind'],
  locale: 'ar' | 'en',
) =>
  ({
    hero: ['القسم الرئيسي', 'Hero'],
    products: ['المنتجات', 'Products'],
    categories: ['التصنيفات', 'Categories'],
    promotion: ['إعلان ترويجي', 'Promotion'],
    text: ['نص تعريفي', 'Text'],
    video: ['فيديو', 'Video'],
  })[kind][locale === 'ar' ? 0 : 1];
export function initialSections(design: StoreDesign) {
  return design.sections.length
    ? design.sections
    : [
        sectionSchema.parse({ id: 'hero', kind: 'hero' }),
        sectionSchema.parse({ id: 'categories', kind: 'categories' }),
        ...(design.videoType !== 'none'
          ? [sectionSchema.parse({ id: 'video', kind: 'video' })]
          : []),
        sectionSchema.parse({ id: 'products', kind: 'products' }),
      ];
}
export function SectionEditor({
  design,
  onChange,
  selected,
  onSelect,
  media,
  videos,
  disabled,
  onUploadImage,
  onUploadVideo,
}: {
  design: StoreDesign;
  onChange: (design: StoreDesign) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  media: Media[];
  videos: { id: string; bytes: number }[];
  disabled: boolean;
  onUploadImage: (file: File, id: string) => void;
  onUploadVideo: (file: File, id: string) => void;
}) {
  const { locale } = useI18n(),
    text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const [newKind, setNewKind] = useState<DesignSection['kind']>('promotion');
  const current = design.sections.find((item) => item.id === selected);
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected)
      controls.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  }, [selected]);
  function update(values: Partial<DesignSection>) {
    onChange({
      ...design,
      sections: design.sections.map((item) =>
        item.id === selected ? { ...item, ...values } : item,
      ),
    });
  }
  function move(index: number, direction: number) {
    const sections = [...design.sections];
    const next = index + direction;
    if (next < 0 || next >= sections.length) return;
    [sections[index], sections[next]] = [sections[next]!, sections[index]!];
    onChange({ ...design, sections });
  }
  function add() {
    if (design.sections.length >= 20) return;
    const section = sectionSchema.parse({
      id: crypto.randomUUID(),
      kind: newKind,
      title:
        newKind === 'promotion' ? text('عنوان الإعلان', 'Promotion title') : '',
    });
    onChange({ ...design, sections: [...design.sections, section] });
    onSelect(section.id);
  }
  return (
    <fieldset
      disabled={disabled}
      className="space-y-5 rounded-2xl border border-border bg-card p-5"
    >
      <legend className="px-2 text-xl font-bold">
        {text('أقسام المتجر', 'Store sections')}
      </legend>
      <p className="text-sm text-muted-foreground">
        {text(
          'اضغط على قسم في المعاينة لتعديله، أو اختاره هنا. الأسهم تغيّر ترتيبه.',
          'Click a preview section to edit it, or select it here. Arrows change its position.',
        )}
      </p>
      <ol className="space-y-2" data-testid="section-list">
        {design.sections.map((item, index) => (
          <li
            key={item.id}
            className={
              'flex flex-wrap items-center gap-2 rounded-xl border p-2 ' +
              (selected === item.id
                ? 'border-primary bg-muted'
                : 'border-border')
            }
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-start text-sm font-semibold"
              aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}
            >
              {sectionLabel(item.kind, locale)}
              {!item.enabled && ' — ' + text('مخفي', 'Hidden')}
            </button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={text('نقل القسم لأعلى', 'Move section up')}
              disabled={index === 0 || disabled}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={text('نقل القسم لأسفل', 'Move section down')}
              disabled={index === design.sections.length - 1 || disabled}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="new-section-kind">
            {text('نوع القسم الجديد', 'New section type')}
          </Label>
          <Select
            id="new-section-kind"
            value={newKind}
            onChange={(event) =>
              setNewKind(event.target.value as DesignSection['kind'])
            }
          >
            {(
              [
                'promotion',
                'text',
                'video',
                'hero',
                'products',
                'categories',
              ] as const
            )
              .filter(
                (kind) =>
                  !['hero', 'products', 'categories'].includes(kind) ||
                  !design.sections.some((section) => section.kind === kind),
              )
              .map((kind) => (
                <option key={kind} value={kind}>
                  {sectionLabel(kind, locale)}
                </option>
              ))}
          </Select>
        </div>
        <Button
          type="button"
          disabled={
            disabled ||
            design.sections.length >= 20 ||
            (['hero', 'products', 'categories'].includes(newKind) &&
              design.sections.some((section) => section.kind === newKind))
          }
          onClick={add}
        >
          {text('إضافة قسم', 'Add section')}
        </Button>
      </div>
      {current && (
        <div ref={controls} className="space-y-4 border-t border-border pt-5">
          <h3 className="font-bold">
            {text('تعديل', 'Edit')} {sectionLabel(current.kind, locale)}
          </h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            {text('إظهار القسم', 'Show section')}
          </label>
          {['products', 'categories', 'video'].includes(current.kind) && (
            <>
              <Label htmlFor="section-title">
                {text('عنوان القسم', 'Section title')}
              </Label>
              <Input
                id="section-title"
                value={current.title}
                maxLength={160}
                onChange={(event) => update({ title: event.target.value })}
              />
            </>
          )}
          {['promotion', 'text'].includes(current.kind) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="section-background">
                  {text('خلفية القسم', 'Section background')}
                </Label>
                <Input
                  id="section-background"
                  type="color"
                  value={current.backgroundColor ?? '#ffffff'}
                  onChange={(event) =>
                    update({ backgroundColor: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="section-text-color">
                  {text('لون نص القسم', 'Section text color')}
                </Label>
                <Input
                  id="section-text-color"
                  type="color"
                  value={current.textColor ?? '#111827'}
                  onChange={(event) =>
                    update({ textColor: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  update({ backgroundColor: null, textColor: null })
                }
              >
                {text('ألوان افتراضية', 'Default colors')}
              </Button>
            </div>
          )}
          {['hero', 'promotion', 'text'].includes(current.kind) && (
            <>
              <Label htmlFor="section-title">
                {text('عنوان القسم', 'Section title')}
              </Label>
              <Input
                id="section-title"
                value={current.title}
                maxLength={160}
                onChange={(event) => update({ title: event.target.value })}
              />
              <Label htmlFor="section-body">
                {text('محتوى القسم', 'Section content')}
              </Label>
              <Textarea
                id="section-body"
                value={current.body}
                maxLength={2000}
                onChange={(event) => update({ body: event.target.value })}
              />
              <Label htmlFor="section-image">
                {text('صورة القسم', 'Section image')}
              </Label>
              <Select
                id="section-image"
                value={current.imageId ?? ''}
                onChange={(event) =>
                  update({ imageId: event.target.value || null })
                }
              >
                <option value="">{text('بدون صورة', 'No image')}</option>
                {media
                  .filter((item) => item.state === 'READY')
                  .map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {text('صورة', 'Image')} {index + 1}
                    </option>
                  ))}
              </Select>
              <Input
                aria-label={text('رفع صورة للقسم', 'Upload section image')}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUploadImage(file, current.id);
                }}
              />
            </>
          )}
          {['hero', 'promotion', 'text'].includes(current.kind) && (
            <>
              <Label htmlFor="section-button">
                {text('نص الزر', 'Button text')}
              </Label>
              <Input
                id="section-button"
                value={current.buttonText}
                maxLength={80}
                onChange={(event) => update({ buttonText: event.target.value })}
              />
              <Label htmlFor="section-url">
                {text(
                  'رابط الزر HTTPS (اختياري)',
                  'HTTPS button URL (optional)',
                )}
              </Label>
              <Input
                id="section-url"
                dir="ltr"
                value={current.buttonUrl}
                maxLength={2000}
                onChange={(event) => update({ buttonUrl: event.target.value })}
              />
              <Label htmlFor="section-alignment">
                {text('محاذاة النص', 'Text alignment')}
              </Label>
              <Select
                id="section-alignment"
                value={current.alignment}
                onChange={(event) =>
                  update({
                    alignment: event.target.value as DesignSection['alignment'],
                  })
                }
              >
                <option value="start">{text('البداية', 'Start')}</option>
                <option value="center">{text('الوسط', 'Center')}</option>
                <option value="end">{text('النهاية', 'End')}</option>
              </Select>
            </>
          )}
          {current.kind === 'video' && (
            <>
              <Label htmlFor="section-video-type">
                {text('مصدر الفيديو', 'Video source')}
              </Label>
              <Select
                id="section-video-type"
                value={current.videoType}
                onChange={(event) =>
                  update({
                    videoType: event.target.value as DesignSection['videoType'],
                  })
                }
              >
                <option value="none">
                  {text('إعداد الفيديو العام', 'Global video setting')}
                </option>
                <option value="youtube">YouTube</option>
                <option value="custom">
                  {text('رابط مخصص', 'Custom URL')}
                </option>
                <option value="upload">MP4</option>
              </Select>
              {current.videoType === 'upload' ? (
                <>
                  <Select
                    aria-label={text('فيديو القسم', 'Section video')}
                    value={current.videoAssetId ?? ''}
                    onChange={(event) =>
                      update({ videoAssetId: event.target.value || null })
                    }
                  >
                    <option value="">
                      {text('اختر فيديو', 'Choose video')}
                    </option>
                    {videos.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {text('فيديو', 'Video')} {index + 1}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={text('رفع فيديو للقسم', 'Upload section video')}
                    type="file"
                    accept="video/mp4"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onUploadVideo(file, current.id);
                    }}
                  />
                </>
              ) : (
                current.videoType !== 'none' && (
                  <>
                    <Label htmlFor="section-video-url">
                      {text('رابط فيديو القسم', 'Section video URL')}
                    </Label>
                    <Input
                      id="section-video-url"
                      value={current.videoUrl}
                      dir="ltr"
                      onChange={(event) =>
                        update({ videoUrl: event.target.value })
                      }
                    />
                  </>
                )
              )}
            </>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange({
                ...design,
                sections: design.sections.filter(
                  (item) => item.id !== current.id,
                ),
              });
              onSelect(null);
            }}
          >
            {text('حذف القسم', 'Delete section')}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
