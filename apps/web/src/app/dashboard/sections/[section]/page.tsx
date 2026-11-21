import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
import { getI18n } from '@/lib/i18n';
const sections: Record<string, [string, string]> = {
  orders: ['الطلبات', 'Orders'],
  inventory: ['المخزون', 'Inventory'],
  customers: ['العملاء', 'Customers'],
  returns: ['المرتجعات', 'Returns'],
  design: ['التصميم', 'Design'],
  pages: ['الصفحات', 'Pages'],
  domain: ['الدومين', 'Domain'],
  marketing: ['التسويق', 'Marketing'],
  reviews: ['التقييمات', 'Reviews'],
  reports: ['التقارير', 'Reports'],
  payments: ['الدفع', 'Payments'],
  shipping: ['الشحن', 'Shipping'],
  extensions: ['الإضافات', 'Extensions'],
  staff: ['الموظفون', 'Staff'],
  subscription: ['الاشتراك', 'Subscription'],
  help: ['المساعدة', 'Help'],
};
export default async function PlannedSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params,
    label = Object.hasOwn(sections, section) ? sections[section] : undefined,
    { locale } = await getI18n();
  if (!label) notFound();
  if (section === 'design') redirect('/dashboard/design');
  return (
    <MerchantShell
      title={locale === 'ar' ? label[0] : label[1]}
      description={
        locale === 'ar'
          ? 'هذا القسم ضمن خطة تطوير سلتي.'
          : 'This section is part of the Sallty roadmap.'
      }
      actions={<LogoutButton />}
      wide
    >
      <div className="rounded-2xl border border-dashed border-border p-8">
        <h2 className="text-xl font-bold">
          {locale === 'ar' ? 'قيد التجهيز' : 'Planned'}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {locale === 'ar'
            ? 'لا توجد عمليات أو خدمات مفعّلة في هذا القسم بعد.'
            : 'No operations or services are active in this section yet.'}
        </p>
        {section === 'inventory' && (
          <Link
            className="mt-5 block text-primary underline"
            href="/dashboard/products"
          >
            {locale === 'ar'
              ? 'يمكن تعديل المخزون من صفحة المنتجات حاليًا.'
              : 'You can currently manage stock from the product editor.'}
          </Link>
        )}
        {section === 'help' && (
          <Link
            href="/forgot-password"
            className="mt-5 block text-primary underline"
          >
            {locale === 'ar' ? 'استعادة كلمة المرور' : 'Reset your password'}
          </Link>
        )}
      </div>
    </MerchantShell>
  );
}
