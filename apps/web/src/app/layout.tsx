import type { Metadata } from 'next';
import './globals.css';
import '@fontsource-variable/cairo';
import { getI18n } from '@/lib/i18n';
import { LocaleProvider, Preferences } from '@/components/preferences';
import { SupportFooter } from '@/components/support-footer';
import { ActivityIndicator } from '@/components/activity-indicator';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://127.0.0.1:3000'),
  title: 'سلتي | Sallty',
  description: 'سلتي: منصة المتاجر الإلكترونية في الدول العربية.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, theme } = await getI18n();
  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-theme={theme}
    >
      <body className="flex min-h-screen flex-col">
        <LocaleProvider locale={locale}>
          <div className="border-b border-border bg-background px-5 py-3">
            <div className="mx-auto flex max-w-7xl justify-end">
              <Preferences />
            </div>
          </div>
          {children}
          <ActivityIndicator />
        </LocaleProvider>
        <SupportFooter />
      </body>
    </html>
  );
}
