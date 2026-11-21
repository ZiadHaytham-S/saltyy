'use client';
import {
  createContext,
  useContext,
  useState,
  useTransition,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun, Languages } from 'lucide-react';
import { translateText } from '@sallty/contracts';
import { Button } from '@/components/ui/button';
const LocaleContext = createContext<'ar' | 'en'>('ar');
export function LocaleProvider({
  locale,
  children,
}: {
  locale: 'ar' | 'en';
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}
export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: (text: string) => translateText(text, locale) };
}
export function Preferences() {
  const { locale } = useI18n(),
    router = useRouter(),
    [pending, startTransition] = useTransition(),
    [wave, setWave] = useState<{ x: number; y: number; id: number } | null>(
      null,
    );
  const previousLocale = useRef(locale);
  useEffect(() => {
    if (previousLocale.current === locale) return;
    previousLocale.current = locale;
    document.documentElement.dataset.languageMotion = 'true';
    const timer = setTimeout(
      () => delete document.documentElement.dataset.languageMotion,
      350,
    );
    return () => {
      clearTimeout(timer);
      delete document.documentElement.dataset.languageMotion;
    };
  }, [locale]);
  useEffect(() => {
    if (!wave) return;
    const timer = setTimeout(() => setWave(null), 600);
    return () => clearTimeout(timer);
  }, [wave]);
  function save(name: string, value: string) {
    document.cookie =
      name +
      '=' +
      value +
      '; Path=/; Max-Age=31536000; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        loading={pending}
        aria-label={
          locale === 'ar'
            ? 'تغيير اللغة إلى الإنجليزية'
            : 'Switch language to Arabic'
        }
        onClick={() => {
          startTransition(() => {
            save('sallty_locale', locale === 'ar' ? 'en' : 'ar');
            router.refresh();
          });
        }}
      >
        <Languages className="size-4" />
        {locale === 'ar' ? 'English' : 'العربية'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={locale === 'ar' ? 'تبديل المظهر' : 'Toggle theme'}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setWave({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
            id: Date.now(),
          });
          const dark = document.documentElement.dataset.theme !== 'dark';
          document.documentElement.dataset.theme = dark ? 'dark' : 'light';
          save('sallty_theme', dark ? 'dark' : 'light');
          startTransition(() => router.refresh());
        }}
      >
        <Moon className="size-4 dark:hidden" />
        <Sun className="hidden size-4 dark:block" />
      </Button>
      {wave && (
        <span
          key={wave.id}
          aria-hidden="true"
          className="sallty-theme-wave"
          style={
            {
              '--wave-x': wave.x + 'px',
              '--wave-y': wave.y + 'px',
            } as CSSProperties
          }
        />
      )}
    </div>
  );
}
