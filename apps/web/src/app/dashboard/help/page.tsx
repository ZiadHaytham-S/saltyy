import Link from 'next/link';
import { BookOpen, ArrowLeft, Package, Truck, ShoppingBag } from 'lucide-react';
import { getI18n } from '@/lib/i18n';
import { getMerchantStore, requireMerchant } from '@/lib/api/merchant';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
import { buttonVariants } from '@/components/ui/button';
export default async function HelpPage() {
  await requireMerchant();
  const store = await getMerchantStore(),
    { locale } = await getI18n();
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const steps = [
    {
      icon: Package,
      title: text('1. أضف منتجًا نشطًا', '1. Add an active product'),
      body: text(
        'من المنتجات، اختر إضافة منتج. أدخل الاسم والسعر والمخزون، وارفع صورة ثم احفظ. اختر الحالة «نشط»؛ المسودة لا تظهر للعملاء. التصنيف اختياري.',
        'Open Products and add a product. Enter its name, price and stock, upload an image and save. Select Active; drafts are hidden from customers. Categories are optional.',
      ),
      href: '/dashboard/products/new',
      action: text('إضافة منتج', 'Add product'),
    },
    {
      icon: Truck,
      title: text('2. احفظ رسوم الشحن', '2. Save your shipping fee'),
      body: text(
        'من الشحن، احفظ الرسوم بالجنيه المصري. صفر يعني شحنًا مجانيًا. Checkout الحالية متاحة للمتاجر المصرية بعملة EGP فقط، والدفع عند الاستلام.',
        'Open Shipping and save your fee in EGP. Zero means free shipping. Checkout currently supports Egyptian EGP stores and cash on delivery only.',
      ),
      href: '/dashboard/shipping',
      action: text('إعداد رسوم الشحن', 'Set shipping fee'),
    },
    {
      icon: ShoppingBag,
      title: text('3. جرّب طلبًا كعميل', '3. Place an order as a customer'),
      body: text(
        'افتح رابط متجرك في نافذة خاصة. أضف منتجًا للسلة، غيّر الكمية ثم أكمل بيانات العميل. التأكيد يعرض رقم الطلب وحالته فقط. الطلب التجريبي حقيقي ويخصم المخزون؛ ألغِه بعد التجربة.',
        'Open your store link in a private window. Add a product to the cart, change its quantity and enter customer details. Confirmation shows only the order number and status. This is a real order that reserves stock; cancel it after testing.',
      ),
      href: store ? '/store/' + store.slug : '/onboarding/store',
      action: text('فتح المتجر', 'Open store'),
    },
    {
      icon: BookOpen,
      title: text(
        '4. تابع الطلب وألغِ طلب التجربة',
        '4. Manage and cancel your test order',
      ),
      body: text(
        'ارجع إلى الطلبات في لوحة التاجر وافتح التفاصيل. راجع العميل ثم أكد الطلب وجهّزه. الإلغاء قبل الشحن يعيد المخزون مرة واحدة. الطلب المشحون أو المسلّم لا يمكن إلغاؤه من هذا المسار.',
        'Return to Orders in your merchant dashboard and open the details. Review the customer, then confirm and prepare the order. Cancellation before shipping restores stock once. Shipped and delivered orders cannot be cancelled through this flow.',
      ),
      href: '/dashboard/orders',
      action: text('فتح الطلبات', 'Open orders'),
    },
  ];
  return (
    <MerchantShell
      title={text('دليل استخدام سلتي', 'Sallty user guide')}
      description={text(
        'جرّب رحلة بيع كاملة بهذه الخطوات، من غير الحاجة لفهم الكود.',
        'Test a complete sales journey with these steps, without needing to read code.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((step) => (
          <section
            key={step.href}
            className="flex flex-col rounded-2xl border border-border p-5 sm:p-6"
          >
            <step.icon className="mb-4 size-6 text-primary" />
            <h2 className="text-lg font-bold">{step.title}</h2>
            <p className="mt-3 mb-6 flex-1 text-sm leading-8 text-muted-foreground">
              {step.body}
            </p>
            <Link
              href={step.href}
              className={buttonVariants({ variant: 'outline' })}
            >
              {step.action}
              <ArrowLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
            </Link>
          </section>
        ))}
      </div>
      <section className="mt-6 rounded-2xl bg-muted p-6">
        <h2 className="font-bold">
          {text(
            'لماذا لا يظهر المنتج أو لا يعمل Checkout؟',
            'Why is a product hidden or checkout unavailable?',
          )}
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-muted-foreground">
          <li>
            {text(
              'تأكد أن المنتج نشط، وليس مسودة أو مؤرشفًا.',
              'Check that the product is Active, rather than Draft or Archived.',
            )}
          </li>
          <li>
            {text(
              'تأكد من وجود مخزون وحفظ إعداد الشحن.',
              'Check available stock and save your shipping settings.',
            )}
          </li>
          <li>
            {text(
              'إذا ظهر خطأ اتصال، أعد المحاولة من نفس الصفحة. إذا استمرت المشكلة، تواصل مع دعم سلتي.',
              'For connection errors, retry from the same page. If the problem persists, contact Sallty support.',
            )}
          </li>
          <li>
            {text(
              'الأقسام الموجودة تحت «مزايا مخطط لها» لم تُنفذ بعد، وليست مطلوبة لرحلة البيع الحالية.',
              'Sections under Planned features are not implemented and are not required for the current sales journey.',
            )}
          </li>
        </ul>
      </section>
    </MerchantShell>
  );
}
