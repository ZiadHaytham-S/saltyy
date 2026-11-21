'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  ChevronDown,
  LayoutDashboard,
  Package,
  Settings,
  Circle,
  ExternalLink,
  Truck,
  Tags,
  ClipboardList,
  BookOpen,
} from 'lucide-react';
import { useI18n } from './preferences';
const dashboardGroups = [
  { ar: 'الرئيسية', en: 'Home', items: [['الملخص', 'Overview', '/dashboard']] },
  {
    ar: 'إدارة البيع',
    en: 'Sales management',
    items: [
      ['الطلبات', 'Orders', '/dashboard/orders'],
      ['المنتجات', 'Products', '/dashboard/products'],
      ['التصنيفات', 'Categories', '/dashboard/categories'],
      ['المخزون', 'Inventory', 'inventory'],
      ['العملاء', 'Customers', 'customers'],
      ['المرتجعات', 'Returns', 'returns'],
    ],
  },
  {
    ar: 'واجهة المتجر',
    en: 'Storefront',
    items: [
      ['التصميم', 'Design', '/dashboard/design'],
      ['الصفحات', 'Pages', 'pages'],
      ['الدومين', 'Domain', 'domain'],
    ],
  },
  {
    ar: 'النمو',
    en: 'Growth',
    items: [
      ['التسويق', 'Marketing', 'marketing'],
      ['التقييمات', 'Reviews', 'reviews'],
      ['التقارير', 'Reports', 'reports'],
    ],
  },
  {
    ar: 'الخدمات',
    en: 'Services',
    items: [
      ['الدفع', 'Payments', 'payments'],
      ['الشحن', 'Shipping', '/dashboard/shipping'],
      ['الإضافات', 'Extensions', 'extensions'],
    ],
  },
  {
    ar: 'الإدارة',
    en: 'Administration',
    items: [
      ['الموظفون', 'Staff', 'staff'],
      ['الاشتراك', 'Subscription', 'subscription'],
      ['الإعدادات', 'Settings', '/dashboard/settings'],
      ['المساعدة', 'Help', '/dashboard/help'],
    ],
  },
] as const;
export function DashboardSidebar({
  storeSlug,
  admin = false,
}: {
  storeSlug?: string;
  admin?: boolean;
}) {
  const { locale } = useI18n(),
    pathname = usePathname();
  const menu = (
    <>
      <Link
        href="/dashboard"
        className="mb-7 flex items-center gap-3 px-3 text-2xl font-bold"
      >
        <span className="rounded-xl bg-primary p-2 text-primary-foreground">
          <ShoppingBag className="size-6" />
        </span>
        {locale === 'ar' ? 'سلتي' : 'Sallty'}
      </Link>
      {dashboardGroups
        .filter((group) => group.items.some((item) => item[2].startsWith('/')))
        .map((group) => (
          <section key={group.en} className="mb-5">
            <h2 className="mb-2 px-3 text-xs font-semibold text-muted-foreground">
              {locale === 'ar' ? group.ar : group.en}
            </h2>
            <ul className="space-y-1">
              {group.items
                .filter((item) => item[2].startsWith('/'))
                .map(([ar, en, target]) => {
                  const ready = target.startsWith('/'),
                    href = ready ? target : '/dashboard/sections/' + target,
                    active =
                      pathname === href ||
                      (href !== '/dashboard' &&
                        pathname.startsWith(href + '/'));
                  const Icon =
                    href === '/dashboard'
                      ? LayoutDashboard
                      : href === '/dashboard/products'
                        ? Package
                        : href === '/dashboard/settings'
                          ? Settings
                          : href === '/dashboard/orders'
                            ? ClipboardList
                            : href === '/dashboard/categories'
                              ? Tags
                              : href === '/dashboard/shipping'
                                ? Truck
                                : href === '/dashboard/help'
                                  ? BookOpen
                                  : Circle;
                  return (
                    <li key={en}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={
                          'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ' +
                          (active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground hover:bg-muted')
                        }
                      >
                        <Icon className="size-4" />
                        <span>{locale === 'ar' ? ar : en}</span>
                        {!ready && (
                          <span
                            className={
                              'ms-auto text-[10px] ' +
                              (active ? 'opacity-80' : 'text-muted-foreground')
                            }
                          >
                            {locale === 'ar' ? 'قريبًا' : 'Soon'}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      <details className="mb-5 rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {locale === 'ar' ? 'مزايا مخطط لها' : 'Planned features'}
        </summary>
        <p className="my-3 text-xs leading-6 text-muted-foreground">
          {locale === 'ar'
            ? 'الأقسام التالية ليست متاحة بعد. لن تحتاجها لتجربة المنتجات والطلبات الحالية.'
            : 'These sections are not available yet. You do not need them to test current products and orders.'}
        </p>
        {dashboardGroups.map((group) => (
          <div key={group.en}>
            {group.items
              .filter((item) => !item[2].startsWith('/'))
              .map(([ar, en, target]) => (
                <Link
                  key={target}
                  href={'/dashboard/sections/' + target}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-muted"
                >
                  <span>{locale === 'ar' ? ar : en}</span>
                  <span>{locale === 'ar' ? 'قريبًا' : 'Soon'}</span>
                </Link>
              ))}
          </div>
        ))}
      </details>
      {storeSlug && (
        <Link
          target="_blank"
          rel="noopener noreferrer"
          href={'/store/' + storeSlug}
          className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"
        >
          <ExternalLink className="size-4" />
          {locale === 'ar' ? 'عرض المتجر' : 'View store'}
        </Link>
      )}
      {admin && (
        <Link
          href="/admin"
          className="mt-3 block rounded-xl border border-border p-3 text-sm"
        >
          {locale === 'ar' ? 'إدارة المنصة' : 'Platform administration'}
        </Link>
      )}
    </>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-e border-border bg-card p-4 lg:block">
        {menu}
      </aside>
      <details className="border-b border-border bg-background p-4 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <ChevronDown className="size-4" />
          {locale === 'ar' ? 'قائمة إدارة المتجر' : 'Store management menu'}
        </summary>
        <nav
          aria-label={locale === 'ar' ? 'قائمة الإدارة' : 'Management menu'}
          className="mt-5"
        >
          {menu}
        </nav>
      </details>
    </>
  );
}
