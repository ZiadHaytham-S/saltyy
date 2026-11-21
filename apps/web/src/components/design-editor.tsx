'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  THEMES,
  designSchema,
  designDraftSchema,
  type StoreDesign,
  type Media,
  type Product,
} from '@sallty/contracts';
import { mutate, uploadImage } from '@/lib/api/client';
import { useI18n } from './preferences';
import { StoreContact, designStyle } from './store-design';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import { SectionEditor, initialSections, sectionLabel } from './section-editor';
import { StoreSection } from './store-sections';
import { LivePreviewPane } from './live-preview-pane';

export function DesignEditor({
  initial,
  version: initialVersion,
  name,
  media,
  products,
  videos,
  fullscreen = false,
}: {
  initial: StoreDesign;
  version: number;
  name: string;
  media: Media[];
  products: Product[];
  videos: { id: string; bytes: number }[];
  fullscreen?: boolean;
}) {
  const { locale } = useI18n(),
    router = useRouter();
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const [design, setDesign] = useState<StoreDesign>(() => ({
      ...initial,
      customLayout: true,
      sections: initialSections(initial),
    })),
    [version, setVersion] = useState(initialVersion),
    [pool, setPool] = useState(media),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [videoPool, setVideoPool] = useState(videos);
  const [selected, setSelected] = useState<string | null>(null),
    [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop'),
    [saved, setSaved] = useState<StoreDesign>(() => ({
      ...initial,
      customLayout: true,
      sections: initialSections(initial),
    }));
  const dirty = JSON.stringify(design) !== JSON.stringify(saved);
  const [actualPreview, setActualPreview] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolsOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [fullscreen]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function field<K extends keyof StoreDesign>(key: K, value: StoreDesign[K]) {
    setDesign((previous) => ({ ...previous, [key]: value }));
    setNotice('');
  }
  const preview = {
    ...design,
    sections: design.sections.map(({ imageId, videoAssetId, ...section }) => ({
      ...section,
      imageUrl: pool.find((image) => image.id === imageId)?.url ?? null,
      videoUrl:
        section.videoType === 'upload' && videoAssetId
          ? '/api/v1/merchant/videos/' + videoAssetId
          : section.videoUrl,
    })),
    bannerUrl: pool.find((item) => item.id === design.bannerId)?.url ?? null,
    videoUrl:
      design.videoType === 'upload' && design.videoAssetId
        ? '/api/v1/merchant/videos/' + design.videoAssetId
        : design.videoUrl,
  };
  async function uploadVideo(file: File | undefined, sectionId?: string) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 20 * 1024 * 1024 || file.type !== 'video/mp4')
        throw new Error(
          text('اختر MP4 بحد أقصى 20 MB.', 'Choose an MP4 up to 20 MB.'),
        );
      const result = (await uploadImage(file, 'video')) as { id: string };
      setVideoPool((items) => [{ id: result.id, bytes: file.size }, ...items]);
      if (sectionId)
        setDesign((value) => ({
          ...value,
          sections: value.sections.map((section) =>
            section.id === sectionId
              ? { ...section, videoAssetId: result.id }
              : section,
          ),
        }));
      else field('videoAssetId', result.id);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Video upload failed',
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteVideo(id: string) {
    setBusy(true);
    setError('');
    try {
      await mutate('/merchant/videos/' + id, {}, 'DELETE');
      setVideoPool((items) => items.filter((item) => item.id !== id));
      if (design.videoAssetId === id) field('videoAssetId', null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Video deletion failed',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(publish = true) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = (publish ? designSchema : designDraftSchema).safeParse(
        design,
      );
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid design');
      const result = (await mutate(
        '/merchant/design',
        { design: parsed.data, version, publish },
        'PATCH',
      )) as { design: StoreDesign; version: number };
      setDesign(result.design);
      setSaved(result.design);
      setVersion(result.version);
      setNotice(
        publish
          ? text(
              'تم حفظ تصميم المتجر ونشره.',
              'Store design saved and applied.',
            )
          : text(
              'تم حفظ المسودة؛ المتجر العام لم يتغير.',
              'Draft saved; the public store is unchanged.',
            ),
      );
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : text('تعذر الحفظ.', 'Unable to save.'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    key: 'logoId' | 'bannerId',
    sectionId?: string,
  ) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = (await uploadImage(file)) as { media: Media };
      setPool((items) => [result.media, ...items]);
      if (sectionId)
        setDesign((value) => ({
          ...value,
          sections: value.sections.map((section) =>
            section.id === sectionId
              ? { ...section, imageId: result.media.id }
              : section,
          ),
        }));
      else field(key, result.media.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }
  const themePicker = (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-bold">
        {text(
          'اختيار الثيم — 10 ثيمات جاهزة',
          'Choose theme — 10 ready-made themes',
        )}
      </summary>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {THEMES.map((theme) => (
          <button
            type="button"
            key={theme.id}
            data-theme-choice={theme.id}
            aria-pressed={design.theme === theme.id}
            onClick={() =>
              setDesign((value) => ({
                ...value,
                theme: theme.id,
                primaryColor: theme.color,
              }))
            }
            className={
              'overflow-hidden rounded-2xl border-2 p-2 text-start ' +
              (design.theme === theme.id ? 'border-primary' : 'border-border')
            }
          >
            <div
              className="theme-thumbnail store-surface mb-3 rounded-xl p-2"
              data-store-theme={theme.id}
              style={designStyle({ ...preview, primaryColor: theme.color })}
            >
              <div
                className="store-hero h-20 rounded-lg p-3"
                data-layout={theme.layout}
              >
                <div className="h-2 w-2/3 rounded bg-current opacity-40" />
                <div className="mt-2 h-1 w-1/2 rounded bg-current opacity-20" />
              </div>
              <div
                className={
                  'mt-2 grid gap-1 ' +
                  (theme.layout === 'compact' ? 'grid-cols-3' : 'grid-cols-2')
                }
              >
                {[0, 1, 2]
                  .slice(0, theme.layout === 'compact' ? 3 : 2)
                  .map((item) => (
                    <div
                      key={item}
                      className="store-product-card h-10 border border-border bg-card"
                    />
                  ))}
              </div>
            </div>
            <span className="text-sm font-bold">
              {locale === 'ar' ? theme.ar : theme.en}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
  return (
    <div
      data-testid={fullscreen ? 'fullscreen-editor' : 'design-editor'}
      className={
        fullscreen
          ? 'fixed inset-0 z-[100] flex h-dvh flex-col bg-background'
          : 'space-y-8'
      }
    >
      <div
        className={
          fullscreen
            ? 'z-30 max-h-[30dvh] shrink-0 overflow-y-auto border-b border-border bg-card p-3 shadow-sm'
            : 'sticky top-3 z-30 rounded-2xl border border-border bg-card p-4 shadow-sm'
        }
      >
        <p
          className={
            fullscreen ? 'sr-only' : 'mb-3 text-sm text-muted-foreground'
          }
        >
          {text(
            'اختر ثيمًا، عدّل المحتوى، راجع المعاينة ثم احفظ. التغييرات لا تظهر للعملاء قبل الحفظ.',
            'Choose a theme, edit content, preview and save. Customers see changes only after saving.',
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            className="text-sm font-bold text-primary underline"
            href={fullscreen ? '/dashboard/design' : '/dashboard/design/editor'}
          >
            {fullscreen
              ? text('العودة إلى Dashboard', 'Back to dashboard')
              : text('فتح المحرّر بملء الشاشة', 'Open fullscreen editor')}
          </a>
          {fullscreen && (
            <Button
              variant="outline"
              aria-expanded={toolsOpen}
              aria-controls="fullscreen-design-tools"
              onClick={() => setToolsOpen((value) => !value)}
            >
              {text('أدوات التعديل والثيمات', 'Editing tools and themes')}
            </Button>
          )}
          <Button loading={busy} onClick={() => void save()}>
            {text('حفظ التصميم وتطبيقه', 'Save and apply design')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void save(false)}
          >
            {text('حفظ مسودة', 'Save draft')}
          </Button>
          <a
            className="text-sm text-primary underline"
            href="/dashboard/design/preview"
            target="_blank"
            rel="noopener noreferrer"
          >
            {text(
              'فتح الموقع الفعلي بآخر مسودة محفوظة',
              'Open actual store with last saved draft',
            )}
          </a>
          <Button
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => {
              setDesign(saved);
              setSelected(null);
            }}
          >
            {text('استعادة آخر حفظ', 'Restore last save')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {dirty
              ? text('تغييرات غير محفوظة', 'Unsaved changes')
              : text('كل التغييرات محفوظة', 'All changes saved')}
          </span>
        </div>
      </div>
      <p
        role="alert"
        className={
          'text-red-600 dark:text-red-400 ' +
          (fullscreen && error ? 'shrink-0 px-3 py-1' : '')
        }
      >
        {error}
      </p>
      <p
        role="status"
        className={
          'text-emerald-700 dark:text-emerald-300 ' +
          (fullscreen && notice ? 'shrink-0 px-3 py-1' : '')
        }
      >
        {notice}
      </p>
      <fieldset
        disabled={busy}
        className={fullscreen ? 'relative min-h-0 flex-1' : 'space-y-8'}
      >
        <legend className="sr-only">
          {text('الثيمات الجاهزة', 'Ready-made themes')}
        </legend>
        {!fullscreen && themePicker}
        <div
          className={
            fullscreen
              ? 'h-full'
              : 'grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'
          }
        >
          <div
            id="fullscreen-design-tools"
            aria-label={text('أدوات تعديل المتجر', 'Store editing tools')}
            className={
              fullscreen
                ? toolsOpen
                  ? 'absolute bottom-0 end-0 top-0 z-30 w-full space-y-6 overflow-y-auto border border-border bg-card p-5 shadow-xl sm:w-[380px]'
                  : 'hidden'
                : 'max-h-[80vh] space-y-6 overflow-y-auto rounded-2xl border border-border bg-card p-5'
            }
          >
            {fullscreen && (
              <Button variant="outline" onClick={() => setToolsOpen(false)}>
                {text('إغلاق الأدوات', 'Close tools')}
              </Button>
            )}
            {fullscreen && themePicker}
            <SectionEditor
              design={design}
              onChange={setDesign}
              selected={selected}
              onSelect={setSelected}
              media={pool}
              videos={videoPool}
              disabled={busy}
              onUploadImage={(file, id) => void upload(file, 'bannerId', id)}
              onUploadVideo={(file, id) => void uploadVideo(file, id)}
            />
            <h2 className="text-xl font-bold">
              {text('ألوان الصفحة والمسافات', 'Page colors and spacing')}
            </h2>
            <Label htmlFor="design-background">
              {text('لون الخلفية', 'Background color')}
            </Label>
            <Input
              id="design-background"
              type="color"
              value={design.backgroundColor ?? '#ffffff'}
              onChange={(event) => field('backgroundColor', event.target.value)}
            />
            <Label htmlFor="design-text-color">
              {text('لون النص', 'Text color')}
            </Label>
            <Input
              id="design-text-color"
              type="color"
              value={design.textColor ?? '#111827'}
              onChange={(event) => field('textColor', event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDesign((value) => ({
                  ...value,
                  backgroundColor: null,
                  textColor: null,
                }))
              }
            >
              {text('ألوان المظهر الافتراضية', 'Default theme colors')}
            </Button>
            <Label htmlFor="design-spacing">
              {text('المسافات بين الأقسام', 'Section spacing')}
            </Label>
            <Select
              id="design-spacing"
              value={design.spacing}
              onChange={(event) =>
                field('spacing', event.target.value as StoreDesign['spacing'])
              }
            >
              <option value="compact">{text('صغيرة', 'Compact')}</option>
              <option value="normal">{text('متوسطة', 'Normal')}</option>
              <option value="spacious">{text('واسعة', 'Spacious')}</option>
            </Select>
            <h2 className="text-xl font-bold">
              {text('إعدادات التصميم', 'Design settings')}
            </h2>
            <Label htmlFor="design-color">
              {text('اللون الأساسي', 'Primary color')}
            </Label>
            <Input
              id="design-color"
              type="color"
              value={design.primaryColor}
              onChange={(e) => field('primaryColor', e.target.value)}
            />
            <Label htmlFor="design-font">{text('الخط', 'Font')}</Label>
            <Select
              id="design-font"
              value={design.font}
              onChange={(e) =>
                field('font', e.target.value as StoreDesign['font'])
              }
            >
              <option value="cairo">Cairo</option>
              <option value="system">Arial / System</option>
            </Select>
            <Label htmlFor="design-columns">
              {text('عدد الأعمدة على الكمبيوتر', 'Desktop columns')}
            </Label>
            <Select
              id="design-columns"
              value={design.columns}
              onChange={(e) => field('columns', Number(e.target.value))}
            >
              {[2, 3, 4].map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </Select>
            <Label htmlFor="design-cards">
              {text('شكل البطاقات', 'Card shape')}
            </Label>
            <Select
              id="design-cards"
              value={design.cardStyle}
              onChange={(e) =>
                field('cardStyle', e.target.value as StoreDesign['cardStyle'])
              }
            >
              <option value="rounded">{text('دائرية', 'Rounded')}</option>
              <option value="square">{text('مربعة', 'Square')}</option>
              <option value="soft">{text('ناعمة', 'Soft')}</option>
            </Select>
            {(['heading', 'announcement'] as const).map((key) => (
              <div key={key}>
                <Label htmlFor={'design-' + key}>
                  {key === 'heading'
                    ? text('العنوان الرئيسي', 'Hero title')
                    : text('شريط الإعلان', 'Announcement')}
                </Label>
                <Input
                  id={'design-' + key}
                  maxLength={160}
                  value={design[key]}
                  onChange={(e) => field(key, e.target.value)}
                />
              </div>
            ))}
            <Label htmlFor="design-description">
              {text('وصف المتجر', 'Store description')}
            </Label>
            <Textarea
              id="design-description"
              value={design.description}
              maxLength={1000}
              onChange={(e) => field('description', e.target.value)}
            />
            {(['heroVisible', 'categoriesVisible'] as const).map((key) => (
              <label className="flex items-center gap-2" key={key}>
                <input
                  type="checkbox"
                  checked={design[key]}
                  onChange={(e) => field(key, e.target.checked)}
                />
                {key === 'heroVisible'
                  ? text('إظهار القسم الرئيسي', 'Show hero')
                  : text('إظهار التصنيفات', 'Show categories')}
              </label>
            ))}
            {(['logoId', 'bannerId'] as const).map((key) => (
              <div key={key} className="space-y-3">
                <Label htmlFor={'design-' + key}>
                  {key === 'logoId'
                    ? text('شعار المتجر', 'Store logo')
                    : text('صورة القسم الرئيسي', 'Hero image')}
                </Label>
                <Select
                  id={'design-' + key}
                  value={design[key] ?? ''}
                  onChange={(e) => field(key, e.target.value || null)}
                >
                  <option value="">{text('بدون صورة', 'No image')}</option>
                  {pool
                    .filter((item) => item.state === 'READY')
                    .map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {text('صورة', 'Image')} {index + 1}
                      </option>
                    ))}
                </Select>
                <Input
                  aria-label={
                    key === 'logoId'
                      ? text('رفع شعار', 'Upload logo')
                      : text('رفع صورة رئيسية', 'Upload hero image')
                  }
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void upload(e.target.files?.[0], key)}
                />
                <p className="text-xs text-muted-foreground">
                  JPEG / PNG / WebP — 5 MB
                </p>
              </div>
            ))}
            <Label htmlFor="design-video-type">
              {text('الفيديو', 'Video')}
            </Label>
            <Select
              id="design-video-type"
              value={design.videoType}
              onChange={(e) =>
                field('videoType', e.target.value as StoreDesign['videoType'])
              }
            >
              <option value="none">{text('بدون فيديو', 'No video')}</option>
              <option value="youtube">YouTube</option>
              <option value="upload">
                {text('رفع فيديو MP4', 'Upload MP4 video')}
              </option>
              <option value="custom">
                {text('رابط فيديو مخصص', 'Custom video URL')}
              </option>
            </Select>
            {['youtube', 'custom'].includes(design.videoType) && (
              <>
                <Label htmlFor="design-video-url">
                  {text('رابط الفيديو HTTPS', 'HTTPS video URL')}
                </Label>
                <Input
                  id="design-video-url"
                  dir="ltr"
                  type="url"
                  maxLength={2000}
                  value={design.videoUrl}
                  onChange={(e) => field('videoUrl', e.target.value)}
                />
                <Label htmlFor="design-video-position">
                  {text('موضع الفيديو', 'Video position')}
                </Label>
                <Select
                  id="design-video-position"
                  value={design.videoPosition}
                  onChange={(e) =>
                    field(
                      'videoPosition',
                      e.target.value as StoreDesign['videoPosition'],
                    )
                  }
                >
                  <option value="before-products">
                    {text('قبل المنتجات', 'Before products')}
                  </option>
                  <option value="after-products">
                    {text('بعد المنتجات', 'After products')}
                  </option>
                </Select>
              </>
            )}
            {design.videoType === 'upload' && (
              <div className="space-y-3">
                <Label htmlFor="design-video-upload">
                  {text('رفع فيديو MP4', 'Upload MP4 video')}
                </Label>
                <Input
                  id="design-video-upload"
                  type="file"
                  accept="video/mp4"
                  onChange={(event) =>
                    void uploadVideo(event.target.files?.[0])
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {text(
                    '20 MB للفيديو؛ 10 فيديوهات و100 MB لكل متجر محليًا.',
                    '20 MB per video; 10 videos and 100 MB per store locally.',
                  )}
                </p>
                <Label htmlFor="design-video-asset">
                  {text('الفيديو المرفوع', 'Uploaded video')}
                </Label>
                <Select
                  id="design-video-asset"
                  value={design.videoAssetId ?? ''}
                  onChange={(event) =>
                    field('videoAssetId', event.target.value || null)
                  }
                >
                  <option value="">{text('اختر فيديو', 'Choose video')}</option>
                  {videoPool.map((asset, index) => (
                    <option value={asset.id} key={asset.id}>
                      {text('فيديو', 'Video')} {index + 1} —{' '}
                      {(asset.bytes / 1024 / 1024).toFixed(1)} MB
                    </option>
                  ))}
                </Select>
                <Label htmlFor="uploaded-video-position">
                  {text('موضع الفيديو', 'Video position')}
                </Label>
                <Select
                  id="uploaded-video-position"
                  value={design.videoPosition}
                  onChange={(event) =>
                    field(
                      'videoPosition',
                      event.target.value as StoreDesign['videoPosition'],
                    )
                  }
                >
                  <option value="before-products">
                    {text('قبل المنتجات', 'Before products')}
                  </option>
                  <option value="after-products">
                    {text('بعد المنتجات', 'After products')}
                  </option>
                </Select>
                {videoPool.map((asset, index) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {text('فيديو', 'Video')} {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void deleteVideo(asset.id)}
                    >
                      {text('حذف الفيديو', 'Delete video')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <h2 className="text-xl font-bold">
              {text('بيانات التواصل العامة', 'Public contact details')}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {text(
                'هذه البيانات تظهر للعملاء؛ بيانات حساب التاجر تبقى خاصة.',
                'These details are public; your account details remain private.',
              )}
            </p>
            {(
              Object.keys(design.contact) as (keyof StoreDesign['contact'])[]
            ).map((key) => (
              <div key={key}>
                <Label htmlFor={'contact-' + key}>
                  {
                    {
                      whatsapp: 'WhatsApp',
                      facebook: 'Facebook',
                      instagram: 'Instagram',
                      tiktok: 'TikTok',
                      linkedin: 'LinkedIn',
                      snapchat: 'Snapchat',
                      phone: text('الهاتف الدولي', 'International phone'),
                      email: text('البريد الإلكتروني', 'Email'),
                      address: text('العنوان', 'Address'),
                    }[key]
                  }
                </Label>
                <Input
                  id={'contact-' + key}
                  dir={key === 'address' ? undefined : 'ltr'}
                  maxLength={key === 'address' ? 500 : 2000}
                  value={design.contact[key]}
                  placeholder={
                    ['phone', 'whatsapp'].includes(key)
                      ? '+201012345678'
                      : undefined
                  }
                  onChange={(e) =>
                    setDesign((value) => ({
                      ...value,
                      contact: { ...value.contact, [key]: e.target.value },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <section
            className={
              fullscreen
                ? 'h-full w-full'
                : 'min-w-0 self-start xl:sticky xl:top-5'
            }
          >
            <div
              className={fullscreen ? 'hidden' : 'mb-4 flex flex-wrap gap-2'}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => setActualPreview((value) => !value)}
              >
                {actualPreview
                  ? text('المعاينة السريعة', 'Quick preview')
                  : text(
                      'الموقع الفعلي — تعديل مباشر',
                      'Actual site — live editing',
                    )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setViewport('desktop')}
              >
                {text('كمبيوتر', 'Desktop')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setViewport('mobile')}
              >
                {text('موبايل', 'Mobile')}
              </Button>
            </div>
            <h2 className={fullscreen ? 'sr-only' : 'mb-4 text-xl font-bold'}>
              {text(
                'معاينة مباشرة — لم يتم النشر بعد',
                'Live preview — not published',
              )}
            </h2>
            {fullscreen || actualPreview ? (
              <LivePreviewPane
                design={design}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  if (fullscreen) setToolsOpen(true);
                }}
                viewport={viewport}
                fullscreen={fullscreen}
              />
            ) : (
              <div
                className="store-surface overflow-hidden rounded-2xl border border-border bg-background p-4 text-foreground"
                data-store-theme={design.theme}
                data-preview-viewport={viewport}
                data-card-style={design.cardStyle}
                style={{
                  ...designStyle(preview),
                  maxWidth: viewport === 'mobile' ? 390 : undefined,
                  marginInline: 'auto',
                }}
              >
                {design.announcement && (
                  <p className="store-announcement mb-4 rounded-lg p-3 text-center text-sm">
                    {design.announcement}
                  </p>
                )}
                <div className="mb-5 flex items-center gap-3">
                  {design.logoId &&
                    pool.find((item) => item.id === design.logoId) && (
                      <Image
                        unoptimized
                        src={
                          pool.find((item) => item.id === design.logoId)!.url
                        }
                        alt={name}
                        width={48}
                        height={48}
                        className="size-12 rounded-xl object-cover"
                      />
                    )}
                  <p className="font-bold">{name}</p>
                </div>
                <div className="store-layout">
                  {preview.sections.map((section) => (
                    <div
                      key={section.id}
                      data-preview-section={section.id}
                      className={
                        'relative rounded-xl border-2 ' +
                        (selected === section.id
                          ? 'border-primary'
                          : 'border-transparent')
                      }
                    >
                      <button
                        type="button"
                        disabled={busy}
                        className="absolute inset-0 z-20 rounded-xl border-2 border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
                        aria-label={
                          text('تعديل قسم ', 'Edit section ') +
                          sectionLabel(section.kind, locale)
                        }
                        onClick={() => setSelected(section.id)}
                      />
                      <StoreSection
                        section={section}
                        design={preview}
                        name={name}
                        locale={locale}
                        categories={
                          <nav className="flex flex-wrap gap-2 rounded-xl bg-muted p-4">
                            <span>{text('كل المنتجات', 'All products')}</span>
                          </nav>
                        }
                        products={
                          <section id="products">
                            <h2 className="mb-5 text-xl font-bold">
                              {section.title ||
                                text('منتجاتنا', 'Our products')}
                            </h2>
                            <div className="store-product-grid grid grid-cols-2 gap-3">
                              {products.slice(0, 4).map((product) => (
                                <article
                                  key={product.id}
                                  className="store-product-card rounded-xl border border-border bg-card p-3"
                                >
                                  {product.images[0] ? (
                                    <Image
                                      src={product.images[0].url}
                                      alt={product.name}
                                      width={250}
                                      height={250}
                                      className="aspect-square w-full rounded-lg object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="aspect-square rounded-lg bg-muted" />
                                  )}
                                  <p className="mt-3 font-bold">
                                    {product.name}
                                  </p>
                                </article>
                              ))}
                            </div>
                            {!products.length && (
                              <p className="rounded-xl bg-muted p-5">
                                {text(
                                  'أضف منتجات لتظهر هنا.',
                                  'Add products to preview them here.',
                                )}
                              </p>
                            )}
                          </section>
                        }
                      />
                      {section.kind === 'video' &&
                        section.videoType === 'none' &&
                        preview.videoType === 'none' && (
                          <p className="rounded-xl bg-muted p-8">
                            {text(
                              'اختر فيديو لهذا القسم',
                              'Choose a video for this section',
                            )}
                          </p>
                        )}
                      {!section.enabled && (
                        <p className="rounded-xl bg-muted p-4 text-sm">
                          {sectionLabel(section.kind, locale)} —{' '}
                          {text('مخفي عن العملاء', 'Hidden from customers')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <StoreContact design={preview} locale={locale} />
              </div>
            )}
          </section>
        </div>
      </fieldset>
    </div>
  );
}
