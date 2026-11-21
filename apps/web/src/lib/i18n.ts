import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { translateText } from '@sallty/contracts';
export const getI18n = cache(async () => {
  const jar = await cookies(),
    locale =
      jar.get('sallty_locale')?.value === 'en'
        ? ('en' as const)
        : ('ar' as const);
  return {
    locale,
    t: (text: string) => translateText(text, locale),
    theme: jar.get('sallty_theme')?.value === 'dark' ? 'dark' : 'light',
  };
});
