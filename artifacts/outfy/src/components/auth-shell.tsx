import { ArrowLeft, Compass, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  backHref?: string;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  backHref,
}: AuthShellProps) {
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-5xl overflow-hidden rounded-[30px] border border-border bg-card shadow-[0_24px_80px_rgba(39,34,72,0.10)] sm:min-h-[calc(100dvh-4rem)] md:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground md:flex md:flex-col">
          <div className="absolute -right-20 -top-14 h-64 w-64 rounded-full border-[34px] border-primary/20" />
          <div className="absolute -bottom-24 -left-12 h-64 w-64 rounded-full border-[28px] border-teal/20" />
          <Link href="/" className="relative flex items-center gap-2.5" aria-label="Volver a Outfy">
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
              Cada día puede empezar con un plan.
            </p>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-sidebar-foreground/60">
              Descubre gente, actividades y pequeñas excusas para salir de casa.
            </p>
          </div>
          <p className="relative mt-12 font-mono-ui text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">
            Tu espacio para quedar
          </p>
        </aside>

        <section className="flex flex-col p-5 sm:p-10 lg:p-14">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Volver a Outfy">
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
                <Compass className="h-4 w-4" />
              </span>
              <span className="font-bold tracking-[-.04em]">
                outfy<span className="text-primary">.</span>
              </span>
            </Link>
            {backHref && (
              <Link
                href={backHref}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver
              </Link>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-.065em] text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </div>

          <div className="mx-auto w-full max-w-[440px] text-center text-xs text-muted-foreground">
            {footer}
          </div>
        </section>
      </div>
    </main>
  );
}