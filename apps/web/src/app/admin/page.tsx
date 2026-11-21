import { getI18n } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireMerchant, request } from '@/lib/api/merchant';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
export default async function AdminPage() {
  const { t } = await getI18n();
  const user = await requireMerchant();
  if (user.role !== 'ADMIN') redirect('/dashboard');
  const response = await request('/admin/summary');
  if (!response.ok) throw new Error('Admin unavailable');
  const summary = z
    .strictObject({ users: z.number().int(), stores: z.number().int() })
    .parse(await response.json());
  return (
    <MerchantShell
      title={t('إدارة المنصة')}
      description={t(
        'مساحة منفصلة لمسؤول سلتي. صلاحيات التاجر لا تمنح الوصول إلى هذه الصفحة.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border p-6">
          <h2>{t('المستخدمون')}</h2>
          <p className="text-3xl font-bold">{summary.users}</p>
        </article>
        <article className="rounded-2xl border p-6">
          <h2>{t('المتاجر')}</h2>
          <p className="text-3xl font-bold">{summary.stores}</p>
        </article>
      </div>
    </MerchantShell>
  );
}
