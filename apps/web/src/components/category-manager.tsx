'use client';
import { useI18n } from '@/components/preferences';

import { useState, type FormEvent } from 'react';
import {
  categoryInputSchema,
  categoryUpdateSchema,
  type Category,
} from '@sallty/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mutate } from '@/lib/api/client';
import { invalidateCatalog } from '@/lib/api/catalog-actions';
import { useHydrated } from '@/lib/use-hydrated';
export function CategoryManager({ categories }: { categories: Category[] }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState<Category | null>(null),
    [deleting, setDeleting] = useState<Category | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const busy = pending || !hydrated;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setError('');
    setSuccess('');
    const input = Object.fromEntries(new FormData(form));
    const parsed = (
      editing ? categoryUpdateSchema : categoryInputSchema
    ).safeParse({ ...input, ...(editing ? { version: editing.version } : {}) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('راجع البيانات'));
      return;
    }
    setPending(true);
    try {
      await mutate(
        '/merchant/categories' + (editing ? '/' + editing.id : ''),
        parsed.data,
        editing ? 'PATCH' : 'POST',
      );
      setEditing(null);
      form.reset();
      setSuccess(t('التصنيف اتحفظ'));
      await invalidateCatalog();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('الحفظ ما تمّش'));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting || pending) return;
    setError('');
    setSuccess('');
    setPending(true);
    try {
      await mutate(
        '/merchant/categories/' + deleting.id,
        { version: deleting.version },
        'DELETE',
      );
      if (editing?.id === deleting.id) setEditing(null);
      setDeleting(null);
      setSuccess(t('التصنيف اتحذف'));
      await invalidateCatalog();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('الحذف ما تمّش'));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-7" aria-busy={pending}>
      <form
        key={editing?.id ?? 'new'}
        onSubmit={submit}
        className="rounded-2xl bg-muted p-5"
      >
        <h2 className="mb-5 font-bold">
          {editing ? t('تعديل التصنيف') : t('إضافة تصنيف')}
        </h2>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="category-name">{t('اسم التصنيف بالعربي')}</Label>
            <Input
              id="category-name"
              name="name"
              required
              maxLength={120}
              defaultValue={editing?.name ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="category-slug">{t('رابط التصنيف (Slug)')}</Label>
            <Input
              id="category-slug"
              name="slug"
              dir="ltr"
              required
              maxLength={80}
              defaultValue={editing?.slug ?? ''}
            />
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled={busy} loading={pending} type="submit">
            {editing ? t('حفظ التصنيف') : t('إضافة التصنيف')}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t('إلغاء التعديل')}
            </Button>
          )}
        </div>
      </form>
      <p
        role="alert"
        className="text-sm leading-7 text-red-700 dark:text-red-400"
      >
        {error}
      </p>
      <p role="status" className="text-sm text-primary">
        {success}
      </p>
      {!categories.length ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <h2 className="font-bold">{t('لسه مفيش تصنيفات')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('ابدأ بتصنيف زي \u00ABملابس\u00BB علشان ترتّب منتجات متجرك.')}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5"
            >
              <div>
                <h2 className="font-bold">{category.name}</h2>
                <p
                  dir="ltr"
                  className="mt-2 break-all text-xs text-muted-foreground"
                >
                  {category.slug}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(category);
                    setError('');
                  }}
                >
                  {t('تعديل')} {category.name}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(category);
                    setError('');
                  }}
                >
                  {t('حذف')} {category.name}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <section className="rounded-2xl border border-border p-5">
          <h2 className="font-bold">
            {t('حذف \u00AB')}
            {deleting.name}
            {t('\u00BB؟')}
          </h2>
          <p className="my-3 text-sm leading-7 text-muted-foreground">
            {t(
              'الحذف نهائي. لو التصنيف مرتبط بمنتجات، حتى المؤرشفة، لازم تنقلها لتصنيف تاني أو تختار \u00ABبدون تصنيف\u00BB الأول.',
            )}
          </p>
          <div className="flex gap-3">
            <Button disabled={busy} loading={pending} onClick={remove}>
              {t('تأكيد حذف التصنيف')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {t('إلغاء')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
