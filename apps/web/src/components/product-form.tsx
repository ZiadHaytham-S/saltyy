'use client';
import { useI18n } from '@/components/preferences';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  productInputSchema,
  productUpdateSchema,
  mediaSchema,
  productSchema,
  moneyToMinor,
  localizedError,
  minorToInput,
  type Currency,
  MAX_IMAGE_BYTES,
  type Product,
  type Category,
  type Media,
} from '@sallty/contracts';
import { Button } from '@/components/ui/button';
import { SalltyLoader } from '@/components/ui/sallty-loader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, mutate, uploadImage } from '@/lib/api/client';
import { invalidateCatalog } from '@/lib/api/catalog-actions';
import { useHydrated } from '@/lib/use-hydrated';
export function ProductForm({
  product,
  categories,
  media,
  currency = 'EGP',
}: {
  product?: Product;
  categories: Category[];
  media: Media[];
  currency?: Currency;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [pool, setPool] = useState(media),
    [selected, setSelected] = useState(product?.imageIds ?? []),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? 'none');
  const [productType, setProductType] = useState<'PHYSICAL' | 'DIGITAL'>(
    product?.type ?? 'PHYSICAL',
  );
  const [status, setStatus] = useState<Product['status']>(
    product?.status ?? 'DRAFT',
  );
  const hydrated = useHydrated();
  const busy = pending || uploading || !hydrated;
  function fail(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure instanceof ApiError
          ? failure.message
          : localizedError('VALIDATION_ERROR', failure.message, locale)
        : t('حصلت مشكلة. جرّب تاني.'),
    );
    if (failure instanceof ApiError) setFields(failure.fields);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setFields({});
    setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      const stock = String(form.get('stockQuantity') ?? '');
      if (!/^\d{1,7}$/.test(stock))
        throw new Error(t('المخزون لازم يكون عدد صحيح موجب أو صفر'));
      const input = {
        type: productType,
        digitalDelivery:
          productType === 'DIGITAL' && form.get('deliveryUrl')
            ? {
                url: String(form.get('deliveryUrl')),
                automatic: form.get('automaticDelivery') === 'on',
              }
            : null,
        name: form.get('name'),
        slug: form.get('slug'),
        description: form.get('description'),
        pricePiastres: moneyToMinor(String(form.get('price')), currency),
        compareAtPricePiastres: form.get('comparePrice')
          ? moneyToMinor(String(form.get('comparePrice')), currency)
          : null,
        sku: form.get('sku') || null,
        stockQuantity: Number(stock),
        categoryId: categoryId === 'none' ? null : categoryId,
        status,
        imageIds: selected,
        ...(product ? { version: product.version } : {}),
      };
      const parsed = (
        product ? productUpdateSchema : productInputSchema
      ).safeParse(input);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues)
          (errors[String(issue.path[0] ?? 'form')] ??= []).push(
            localizedError('VALIDATION_ERROR', issue.message, locale),
          );
        setFields(errors);
        throw new Error(
          t('راجع بيانات المنتج: ') +
            localizedError(
              'VALIDATION_ERROR',
              parsed.error.issues[0]?.message ?? '',
              locale,
            ),
        );
      }
      setPending(true);
      z.object({ product: productSchema }).parse(
        await mutate(
          '/merchant/products' + (product ? '/' + product.id : ''),
          parsed.data,
          product ? 'PATCH' : 'POST',
        ),
      );
      await invalidateCatalog();
      router.push('/dashboard/products');
    } catch (failure) {
      fail(failure);
    } finally {
      setPending(false);
    }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setError('');
    setNotice('');
    if (
      file.size > MAX_IMAGE_BYTES ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setError(t('اختار JPEG أو PNG أو WebP، بحد أقصى 5 MB'));
      return;
    }
    setUploading(true);
    try {
      const { media: image } = z
        .object({ media: mediaSchema })
        .parse(await uploadImage(file));
      setPool((items) => [image, ...items]);
      setSelected((items) => (items.length < 8 ? [...items, image.id] : items));
      setNotice(t('الصورة اترفعت. احفظ المنتج علشان ربط الصور يتسجل.'));
      await invalidateCatalog();
    } catch (failure) {
      fail(failure);
    } finally {
      setUploading(false);
    }
  }
  async function removeImage(id: string) {
    setUploading(true);
    setError('');
    try {
      await mutate('/merchant/media/' + id, {}, 'DELETE');
      setPool((items) => items.filter((item) => item.id !== id));
      setSelected((items) => items.filter((item) => item !== id));
      setDeleteId(null);
      setNotice(t('الصورة اتحذفت من المكتبة'));
      await invalidateCatalog();
    } catch (failure) {
      fail(failure);
    } finally {
      setUploading(false);
    }
  }
  function field(
    name: string,
    label: string,
    value = '',
    options: {
      required?: boolean;
      maxLength?: number;
      dir?: 'ltr';
      inputMode?: 'decimal' | 'numeric';
    } = {},
  ) {
    const key =
      name === 'price'
        ? 'pricePiastres'
        : name === 'comparePrice'
          ? 'compareAtPricePiastres'
          : name;
    return (
      <div>
        <Label htmlFor={'product-' + name}>{label}</Label>
        <Input
          id={'product-' + name}
          name={name}
          defaultValue={value ?? ''}
          disabled={busy}
          {...options}
          aria-invalid={Boolean(fields[key])}
          aria-describedby={fields[key] ? key + '-error' : undefined}
        />
        {fields[key] && (
          <p
            id={key + '-error'}
            className="mt-2 text-xs text-red-700 dark:text-red-400"
          >
            {t(fields[key]?.[0] ?? '')}
          </p>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={submit} aria-busy={busy} className="space-y-8">
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="product-type">
            {locale === 'ar' ? 'نوع المنتج' : 'Product type'}
          </Label>
          <Select
            id="product-type"
            value={productType}
            onChange={(event) =>
              setProductType(event.target.value as 'PHYSICAL' | 'DIGITAL')
            }
          >
            <option value="PHYSICAL">
              {locale === 'ar'
                ? 'منتج ملموس — يحتاج إلى شحن'
                : 'Physical — shipping required'}
            </option>
            <option value="DIGITAL">
              {locale === 'ar'
                ? 'منتج رقمي — بدون شحن'
                : 'Digital — no shipping'}
            </option>
          </Select>
          {productType === 'DIGITAL' && (
            <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
              <Label htmlFor="delivery-url">
                {locale === 'ar'
                  ? 'رابط تسليم المنتج (خاص)'
                  : 'Private delivery URL'}
              </Label>
              <Input
                id="delivery-url"
                name="deliveryUrl"
                type="url"
                dir="ltr"
                maxLength={2000}
                defaultValue={product?.digitalDelivery?.url ?? ''}
                placeholder="https://"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="automaticDelivery"
                  defaultChecked={product?.digitalDelivery?.automatic ?? true}
                />
                {locale === 'ar'
                  ? 'تسليم تلقائي بعد تأكيد استلام المبلغ'
                  : 'Automatic delivery after payment confirmation'}
              </label>
              <p className="text-sm text-muted-foreground">
                {locale === 'ar'
                  ? 'الرابط لا يظهر في المتجر. الكمية تمثل عدد التراخيص المتاحة. التسليم اليدوي يظل متاحًا بعد تأكيد الدفع.'
                  : 'The URL is hidden from the catalog. Stock counts available licenses. Manual release is available after payment confirmation.'}
              </p>
            </div>
          )}
        </div>
        <legend className="mb-4 font-bold">{t('بيانات المنتج')}</legend>
        {field('name', t('اسم المنتج بالعربي'), product?.name, {
          required: true,
          maxLength: 120,
        })}
        {field('slug', t('رابط المنتج (Slug)'), product?.slug, {
          required: true,
          maxLength: 80,
          dir: 'ltr',
        })}
        <div className="sm:col-span-2">
          <Label htmlFor="product-description">{t('وصف المنتج')}</Label>
          <Textarea
            id="product-description"
            name="description"
            defaultValue={product?.description ?? ''}
            maxLength={5000}
          />
        </div>
        {field(
          'price',
          t('السعر (') + currency + ')',
          product ? minorToInput(product.pricePiastres, currency) : '',
          { required: true, inputMode: 'decimal', dir: 'ltr' },
        )}
        {field(
          'comparePrice',
          t('سعر قبل الخصم (اختياري)'),
          product?.compareAtPricePiastres
            ? minorToInput(product.compareAtPricePiastres, currency)
            : '',
          { inputMode: 'decimal', dir: 'ltr' },
        )}
        {field('sku', t('SKU (كود المنتج، اختياري)'), product?.sku ?? '', {
          maxLength: 64,
          dir: 'ltr',
        })}
        {field(
          'stockQuantity',
          t('عدد القطع المتاحة'),
          String(product?.stockQuantity ?? 0),
          { required: true, inputMode: 'numeric', dir: 'ltr' },
        )}
        <div>
          <Label htmlFor="product-category">{t('التصنيف')}</Label>
          <Select
            id="product-category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="none">{t('بدون تصنيف')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {!categories.length && (
            <Link
              href="/dashboard/categories"
              className="mt-2 inline-block text-xs text-primary underline"
            >
              {t('ضيف أول تصنيف')}
            </Link>
          )}
        </div>
        <div>
          <Label htmlFor="product-status">{t('حالة المنتج')}</Label>
          <Select
            id="product-status"
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Product['status'])
            }
          >
            <option value="DRAFT">{t('مسودة')}</option>
            <option value="ACTIVE">{t('نشط')}</option>
            <option value="ARCHIVED">{t('مؤرشف')}</option>
          </Select>
        </div>
      </fieldset>
      <section
        className="rounded-2xl border border-border p-5"
        aria-labelledby="images-title"
      >
        <h2 id="images-title" className="font-bold">
          {t('صور المنتج \u00B7')}
          {selected.length}/8
        </h2>
        <p className="mt-2 mb-4 text-xs leading-7 text-muted-foreground">
          {t(
            'JPEG، PNG أو WebP، بحد أقصى 5 MB للصورة. اختار لحد 8 صور من مكتبة متجرك. أول صورة مختارة هي الرئيسية. فصل الصورة بيحتاج حفظ المنتج؛ الحذف من المكتبة نهائي ومتاح للصور غير المستخدمة بس. حد المكتبة 50 صورة و100 MB.',
          )}
        </p>
        <Label htmlFor="product-upload">{t('رفع صورة جديدة')}</Label>
        <Input
          id="product-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || pool.length >= 50}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void upload(file);
          }}
        />
        {!pool.length ? (
          <p className="mt-6 rounded-xl bg-muted p-5 text-sm">
            {t('مكتبة الصور فاضية. ارفع صورة للمنتج أو احفظه من غير صور.')}
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pool.map((image, index) => (
              <div
                key={image.id}
                className={
                  'min-w-0 rounded-xl border p-2 ' +
                  (selected.includes(image.id)
                    ? 'border-primary bg-blue-50'
                    : 'border-border')
                }
              >
                {image.state === 'READY' ? (
                  <Image
                    unoptimized
                    src={image.url}
                    alt={t('صورة من مكتبة المتجر ') + (index + 1)}
                    width={image.width}
                    height={image.height}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-muted text-xs">
                    {t('الحذف محتاج إعادة محاولة')}
                  </div>
                )}
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.includes(image.id)}
                    disabled={
                      busy ||
                      image.state !== 'READY' ||
                      (!selected.includes(image.id) && selected.length >= 8)
                    }
                    onChange={(event) =>
                      setSelected((items) =>
                        event.target.checked
                          ? [...items, image.id]
                          : items.filter((item) => item !== image.id),
                      )
                    }
                  />
                  {selected.indexOf(image.id) === 0
                    ? t('الصورة الرئيسية')
                    : t('ربط بالمنتج')}
                </label>
                <button
                  type="button"
                  className="mt-3 text-xs text-red-700 dark:text-red-400 underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setDeleteId(image.id)}
                >
                  {t('حذف من المكتبة')}
                </button>
              </div>
            ))}
          </div>
        )}
        {deleteId && (
          <div className="mt-4 rounded-xl bg-muted p-4">
            <p className="mb-3 text-sm">
              {t(
                'تحذف الصورة نهائيًا من المكتبة؟ لو مستخدمة في منتج، السيرفر هيرفض الحذف.',
              )}
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => removeImage(deleteId)}
              >
                {t('تأكيد حذف الصورة')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDeleteId(null)}
              >
                {t('إلغاء')}
              </Button>
            </div>
          </div>
        )}
        <p role="status" className="mt-3 text-sm text-primary">
          {uploading ? <SalltyLoader decorative className="size-10" /> : notice}
        </p>
      </section>
      <p
        role="alert"
        className="text-sm leading-7 text-red-700 dark:text-red-400"
      >
        {error}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy} loading={pending}>
          {product ? t('حفظ التعديلات') : t('إضافة المنتج')}
        </Button>
        <Link
          className="text-sm text-muted-foreground underline"
          href="/dashboard/products"
        >
          {t('رجوع للمنتجات')}
        </Link>
      </div>
    </form>
  );
}
