import { getI18n } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Tags,
  Plus,
  Archive,
  FileText,
  CheckCircle2,
  Truck,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantForm, LogoutButton } from '@/components/merchant-form';
import { MerchantNav } from '@/components/merchant-nav';
import { Button, buttonVariants } from '@/components/ui/button';
import { requireMerchant, getMerchantStore } from '@/lib/api/merchant';
import { getProducts, getCategories } from '@/lib/api/catalog';
import { getOrders, getShipping } from '@/lib/api/orders';
export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const merchant = await requireMerchant();
  const store = await getMerchantStore();
  if (!store) redirect('/onboarding/store');
  const [active, drafts, archived, categories, shipping, pendingOrders] =
    await Promise.all([
      getProducts({ status: 'ACTIVE', page: 1, pageSize: 1 }),
      getProducts({ status: 'DRAFT', page: 1, pageSize: 1 }),
      getProducts({ status: 'ARCHIVED', page: 1, pageSize: 1 }),
      getCategories(),
      getShipping(),
      getOrders({ status: 'PENDING', page: 1, pageSize: 1 }),
    ]);
  return (
    <MerchantShell
      title={t('أهلًا يا ') + merchant.name}
      description={text(
        'كل ما تحتاجه لإدارة متجرك، من أول منتج إلى متابعة الطلبات.',
        'Everything you need to manage your store, from your first product to your orders.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <MerchantNav active="dashboard" />
      <section
        className="mb-7 rounded-2xl border border-border bg-muted p-5 sm:p-7"
        aria-labelledby="setup-title"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary">
              {text('ابدأ من هنا', 'Start here')}
            </p>
            <h2 id="setup-title" className="mt-1 text-xl font-bold">
              {text(
                'متجرك جاهز خطوة بخطوة',
                'Get your store ready, step by step',
              )}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {text(
                'هذه الخطوات تعتمد على إعدادات متجرك الفعلية. جرّب رحلة العميل قبل مشاركة الرابط.',
                'These steps use your actual store settings. Test the customer journey before sharing your link.',
              )}
            </p>
          </div>
          <Link
            href="/dashboard/help"
            className={buttonVariants({ variant: 'outline' })}
          >
            <BookOpen className="size-4" />
            {text('دليل الاستخدام', 'User guide')}
          </Link>
        </div>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: text('أضف منتجًا للبيع', 'Add a product to sell'),
              description: text(
                'اسم، سعر، صورة ومخزون. اختر «نشط» ليظهر للعملاء.',
                'Name, price, image and stock. Select Active to show it to customers.',
              ),
              done: active.total > 0,
              href:
                active.total > 0
                  ? '/dashboard/products'
                  : '/dashboard/products/new',
              action: text('إدارة المنتجات', 'Manage products'),
              icon: Package,
            },
            {
              title: text('اضبط رسوم الشحن', 'Set your shipping fee'),
              description: shipping.checkoutSupported
                ? text(
                    'احفظ الرسوم، أو صفرًا للشحن المجاني. الدفع عند الاستلام فقط.',
                    'Save a fee, or zero for free shipping. Cash on delivery only.',
                  )
                : text(
                    'الكتالوج متاح؛ Checkout الحالية تدعم المتاجر المصرية بعملة EGP فقط.',
                    'Your catalog is available; checkout currently supports Egyptian EGP stores only.',
                  ),
              done:
                shipping.shippingFeePiastres !== null &&
                shipping.checkoutSupported,
              href: '/dashboard/shipping',
              action: text('إعداد الشحن', 'Shipping settings'),
              icon: Truck,
            },
            {
              title: text('جرّب تجربة العميل', 'Test the customer journey'),
              description: text(
                'افتح المتجر، أضف منتجًا للسلة وأكمل طلبًا تجريبيًا من نافذة خاصة.',
                'Open your store, add a product to the cart and place a test order in a private window.',
              ),
              done: false,
              href: '/store/' + store.slug,
              action: text('فتح متجر العميل', 'Open customer storefront'),
              icon: ShoppingBag,
            },
          ].map((step, index) => (
            <li
              key={step.href}
              className="flex flex-col rounded-xl border border-border bg-background p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <step.icon className="size-5 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {step.done ? (
                    <span className="flex items-center gap-1 text-primary">
                      <CheckCircle2 className="size-4" />
                      {text('مكتمل', 'Complete')}
                    </span>
                  ) : (
                    text('خطوة ' + (index + 1), 'Step ' + (index + 1))
                  )}
                </span>
              </div>
              <h3 className="font-bold">{step.title}</h3>
              <p className="mt-2 mb-4 flex-1 text-sm leading-7 text-muted-foreground">
                {step.description}
              </p>
              <Link
                className="text-sm font-semibold text-primary underline underline-offset-4"
                href={step.href}
              >
                {step.action}
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <ShoppingBag className="size-5 text-primary" />
            {text('طلبات تحتاج تأكيدك', 'Orders awaiting confirmation')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {pendingOrders.total > 0
              ? text(
                  `لديك ${pendingOrders.total} طلبًا بانتظار التأكيد. راجع بيانات العميل قبل التجهيز.`,
                  `${pendingOrders.total} orders await confirmation. Review customer details before preparing them.`,
                )
              : text(
                  'لا توجد طلبات معلّقة. الطلبات الجديدة ستظهر هنا بعد Checkout.',
                  'No pending orders. New checkout orders will appear here.',
                )}
          </p>
        </div>
        <Link
          href="/dashboard/orders"
          className={buttonVariants({ variant: 'outline' })}
        >
          {text('متابعة الطلبات', 'Manage orders')}
        </Link>
      </section>
      <section
        className="mb-7 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-linear-to-l from-blue-700 to-indigo-950 p-6 text-white"
        aria-labelledby="store-title"
      >
        <div>
          <p className="mb-2 text-xs text-blue-200">{t('متجرك')}</p>
          <h2 id="store-title" className="text-2xl font-bold">
            {store.name}
          </h2>
          <p className="mt-3 text-xs text-blue-100">
            {t('معرّف المتجر:')}
            <span dir="ltr">{store.slug}</span>
          </p>
        </div>
        <Button asChild className="bg-white text-blue-800 hover:bg-blue-50">
          <Link href="/dashboard/products/new">
            <Plus size={18} aria-hidden="true" />
            {t('إضافة منتج')}
          </Link>
        </Button>
      </section>
      <section className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5">
        <div>
          <h2 className="font-bold">{t('رابط متجرك للعملاء')}</h2>
          <p className="mt-2 break-all text-sm text-muted-foreground" dir="ltr">
            /store/{store.slug}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            href={'/store/' + store.slug}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('عرض المتجر')}
          </Link>
        </Button>
      </section>
      <section
        aria-label={t('ملخص المنتجات')}
        className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          {
            label: t('منتجات نشطة'),
            count: active.total,
            icon: Package,
            href: '/dashboard/products?status=ACTIVE',
          },
          {
            label: t('مسودات'),
            count: drafts.total,
            icon: FileText,
            href: '/dashboard/products?status=DRAFT',
          },
          {
            label: t('منتجات مؤرشفة'),
            count: archived.total,
            icon: Archive,
            href: '/dashboard/products?status=ARCHIVED',
          },
          {
            label: t('تصنيفات'),
            count: categories.length,
            icon: Tags,
            href: '/dashboard/categories',
          },
        ].map(({ label, count, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border border-border p-5 transition hover:bg-muted"
          >
            <Icon size={22} className="mb-4 text-primary" aria-hidden="true" />
            <p className="text-2xl font-bold">{count}</p>
            <h2 className="mt-2 text-xs text-muted-foreground">{label}</h2>
          </Link>
        ))}
      </section>
      <details className="mb-7 rounded-2xl border border-border p-5">
        <summary className="cursor-pointer font-semibold">
          {t('تعديل اسم المتجر')}
        </summary>
        <p className="my-4 text-sm leading-7 text-muted-foreground">
          {t(
            'ده تعديل للاسم اللي بتدير بيه متجرك. مش خطوة تسجيل جديدة، ومش هيغيّر معرّف المتجر.',
          )}
        </p>
        <MerchantForm mode="edit-store" initialName={store.name} />
      </details>
      <p className="text-xs leading-7 text-muted-foreground">
        {text(
          'المنتجات النشطة تظهر للعملاء؛ المسودات والمؤرشفة مخفية. استقبال طلبات الدفع عند الاستلام يتطلب متجرًا مصريًا بعملة EGP وحفظ رسوم الشحن.',
          'Active products appear to customers; drafts and archived products stay hidden. COD checkout requires an Egyptian EGP store and a saved shipping fee.',
        )}
      </p>
    </MerchantShell>
  );
}
