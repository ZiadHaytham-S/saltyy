import { Camera, Globe, MessageCircle } from 'lucide-react';
import { getI18n } from '@/lib/i18n';
export async function SupportFooter() {
  const { locale } = await getI18n();
  const links = [
    { name: 'Instagram', icon: Camera, url: process.env.SUPPORT_INSTAGRAM_URL },
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      url: process.env.SUPPORT_WHATSAPP_URL,
    },
    { name: 'Facebook', icon: Globe, url: process.env.SUPPORT_FACEBOOK_URL },
  ];
  return (
    <footer className="mt-auto border-t border-border bg-background px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5">
        <div>
          <p className="font-bold">
            {locale === 'ar' ? 'دعم سلتي' : 'Sallty Support'}
          </p>
          <p className="text-xs text-muted-foreground">
            {locale === 'ar'
              ? 'تواصل معنا عبر حسابات الدعم الرسمية.'
              : 'Contact our official support channels.'}
          </p>
        </div>
        <nav
          aria-label={locale === 'ar' ? 'روابط الدعم' : 'Support links'}
          className="flex flex-wrap gap-5"
        >
          {links.map(({ name, icon: Icon, url }) => {
            let valid = false;
            try {
              const parsed = new URL(url ?? '');
              valid =
                parsed.protocol === 'https:' &&
                !parsed.username &&
                !parsed.password &&
                (name === 'WhatsApp'
                  ? ['wa.me', 'api.whatsapp.com'].includes(parsed.hostname)
                  : name === 'Instagram'
                    ? ['instagram.com', 'www.instagram.com'].includes(
                        parsed.hostname,
                      )
                    : ['facebook.com', 'www.facebook.com'].includes(
                        parsed.hostname,
                      ));
            } catch {}
            return valid ? (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary"
              >
                <Icon className="size-4" />
                {name}
              </a>
            ) : (
              <span
                key={name}
                aria-disabled="true"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon className="size-4" />
                {name}
                <span className="text-xs">
                  {locale === 'ar' ? 'قريبًا' : 'Soon'}
                </span>
              </span>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
