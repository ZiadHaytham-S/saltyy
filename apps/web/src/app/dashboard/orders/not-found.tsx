import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
export default async function NotFound() {
  const { locale } = await getI18n();
  return (
    <div className="p-8">
      <h1>{locale === 'ar' ? 'الطلب غير موجود' : 'Order not found'}</h1>
      <Link className="text-primary underline" href="/dashboard/orders">
        {locale === 'ar' ? 'العودة إلى الطلبات' : 'Return to orders'}
      </Link>
    </div>
  );
}
