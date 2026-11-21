'use client';
import { useSyncExternalStore } from 'react';
import {
  activitySnapshot,
  activityServerSnapshot,
  subscribeActivity,
} from '@/lib/activity';
import { SalltyLoader } from './ui/sallty-loader';
import { useI18n } from './preferences';
export function ActivityIndicator() {
  const count = useSyncExternalStore(
      subscribeActivity,
      activitySnapshot,
      activityServerSnapshot,
    ),
    { locale } = useI18n();
  return count > 0 ? (
    <div
      className="sallty-activity pointer-events-none fixed bottom-5 start-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 text-primary shadow-xl rtl:translate-x-1/2"
      role="status"
      aria-label={locale === 'ar' ? 'جارٍ تنفيذ الطلب' : 'Request in progress'}
      data-testid="activity-indicator"
    >
      <SalltyLoader className="size-9" decorative />
      <span className="text-sm font-bold">
        {locale === 'ar' ? 'سلتي' : 'Sallty'}
      </span>
      <span className="sr-only">
        {locale === 'ar' ? 'جارٍ تنفيذ الطلب' : 'Request in progress'}
      </span>
    </div>
  ) : null;
}
