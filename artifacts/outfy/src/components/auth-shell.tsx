import { ArrowLeft, Compass, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  backHref?: string;
  singleColumn?: boolean;
  brandLogoSrc?: string;
  showLanguageSwitcher?: boolean;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  backHref,
  singleColumn = false,
  brandLogoSrc,
  showLanguageSwitcher = false,
}: AuthShellProps) {
  const { t } = useTranslation(['auth', 'common']);
  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-2 py-2 md:block md:px-8 md:py-8">
      <div
        className={`mx-auto w-full overflow-hidden rounded-[30px] border border-border bg-card shadow-2xl ${
          singleColumn
            ? 'my-auto max-w-[620px]'
            : 'grid min-h-[calc(100dvh-2.5rem)] max-w-5xl sm:min-h-[calc(100dvh-4rem)] md:grid-cols-[0.85fr_1.15fr]'
        }`}
      >
        
        {!singleColumn && (
          <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground md:flex md:flex-col">
            <div className="absolute -right-20 -top-14 h-64 w-64 rounded-full border-[34px] border-primary/20" />
            <div className="absolute -bottom-24 -left-12 h-64 w-64 rounded-full border-[28px] border-primary/20" />
            <Link href="/" className="relative flex items-center gap-2.5" aria-label={t('common:brand.backToOutfy')}>
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
                <Compass className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="text-xl font-bold tracking-[-.04em]">
                outfy<span className="text-primary">.</span>
              </span>
            </Link>
            <div className="relative mt-auto">
              <Sparkles className="h-6 w-6 text-accent" />
              <p className="mt-5 max-w-xs text-3xl font-bold leading-[1.04] tracking-[-.055em]">
                {t('auth:shell.tagline')}
              </p>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-sidebar-foreground/60">
                {t('auth:shell.description')}
              </p>
            </div>
            <p className="relative mt-12 font-mono-ui text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">
              {t('auth:shell.footer')}
            </p>
          </aside>
        )}

        <section
          className={`flex flex-col ${
            singleColumn
              ? 'px-3 py-3 md:p-10 lg:p-14'
              : 'p-5 sm:p-10 lg:p-14'
          }`}
        >
          <div className="flex items-center justify-between">
            {!brandLogoSrc && (
              <Link href="/" className="flex items-center gap-2 md:hidden" aria-label={t('common:brand.backToOutfy')}>
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
                  <Compass className="h-4 w-4" />
                </span>
                <span className="font-bold tracking-[-.04em]">
                  outfy<span className="text-primary">.</span>
                </span>
              </Link>
            )}
            {(backHref || showLanguageSwitcher) && (
              <div className="ml-auto flex items-center gap-3">
                {backHref && (
                  <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t('common:actions.back')}
                  </Link>
                )}

                {showLanguageSwitcher && (
                  <LanguageSwitcher />
                )}
              </div>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-[500px] flex-col px-0 py-2 md:px-10 md:pt-10 md:pb-5">
            {brandLogoSrc && (
              <Link
                href="/"
                className="mb-4 block w-full md:mb-8"
                aria-label={t('common:brand.backToOutfy')}
              >
                <div className="mx-0 rounded-[22px] border border-primary/70 bg-black p-1.5 shadow-[0_0_0_1px_rgba(163,230,53,0.08)] md:-mx-10">
                  <img
                    src={brandLogoSrc}
                    alt="Outfy"
                    className="block h-auto w-full rounded-[18px] object-contain"
                  />
                </div>
              </Link>
            )}
            <div className="pl-2 md:pl-0">
              <p className="font-mono-ui text-base font-semibold uppercase tracking-[.12em] text-primary md:text-lg">
                {eyebrow}
              </p>

              <h1 className="mt-2 text-[2.7rem] font-bold leading-tight tracking-[-.055em] text-foreground md:mt-3 md:text-[3.4rem]">
                {title}
              </h1>

              <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-muted-foreground md:mt-5 md:text-lg">
                {description}
              </p>

              <div className="mt-5 md:mt-8">{children}</div>
            </div>
          </div>

          <div className="mx-auto mt-5 w-full max-w-[500px] text-center text-base text-muted-foreground md:mt-4 md:text-[17px]">
            {footer}
          </div>
        </section>
      </div>
    </main>
  );
}