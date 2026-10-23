import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';

export default function NotFound() {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="text-center">
        <Compass className="mx-auto h-10 w-10 text-primary" />

        <p className="mt-5 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
          {t('notFound.eyebrow')}
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          {t('notFound.title')}
        </h1>

        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-foreground px-4 py-3 text-xs font-bold text-background"
          data-testid="link-not-found-home"
        >
          {t('notFound.backHome')}
        </Link>
      </div>
    </div>
  );
}