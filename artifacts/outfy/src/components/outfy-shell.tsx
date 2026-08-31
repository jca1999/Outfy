import { Bell, ChevronDown, Compass, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { navItems } from '@/constants';
import { cn } from '@/utils';
import { useAuth } from '@/auth/auth-context';

interface OutfyShellProps {
  children: ReactNode;
  onCreateActivity: () => void;
}

export function OutfyShell({ children, onCreateActivity }: OutfyShellProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [notificationsRead, setNotificationsRead] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground md:flex">
        <Link href="/" className="mb-12 flex items-center gap-2.5" data-testid="link-brand-sidebar">
          <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-primary text-primary-foreground"><Compass className="h-5 w-5" strokeWidth={2.5} /></span>
          <span className="text-xl font-bold tracking-[-.04em]">outfy<span className="text-primary">.</span></span>
        </Link>
        <p className="mb-3 px-3 font-mono-ui text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/45">Tu espacio</p>
        <nav className="space-y-1" aria-label="Navegación principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground', active && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground')}
                data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
                {item.label === 'Mensajes' && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono-ui text-[9px] text-primary-foreground">4</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4">
          <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-sidebar-foreground/45">Tu próxima historia</p>
          <p className="mt-2 text-sm font-medium leading-snug">Hay 12 planes nuevos cerca de ti.</p>
          <Link href="/explore" className="mt-3 inline-flex text-xs font-bold text-primary" data-testid="link-sidebar-explore">Ver planes <span className="ml-1">→</span></Link>
        </div>
      </aside>
      <div className="md:pl-[238px]">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-4 py-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3">
            <Link href="/explore" className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex" data-testid="link-header-search">
              <Search className="h-4 w-4" /><span>¿Qué te apetece hacer?</span><span className="ml-10 font-mono-ui text-[9px] text-muted-foreground/60">⌘ K</span>
            </Link>
            <Link href="/" className="flex items-center gap-2 md:hidden" data-testid="link-brand-mobile">
              <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-primary text-primary-foreground"><Compass className="h-4 w-4" /></span><span className="font-bold tracking-[-.04em]">outfy<span className="text-primary">.</span></span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={onCreateActivity} className="hidden items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-xs font-bold text-background transition hover:bg-primary sm:flex" data-testid="button-create-activity"><Plus className="h-3.5 w-3.5" />Crear plan</button>
              <button type="button" onClick={() => setNotificationsRead((current) => !current)} className="relative rounded-full p-2.5 text-muted-foreground hover:bg-muted" aria-label="Notificaciones" data-testid="button-notifications"><Bell className="h-[18px] w-[18px]" />{!notificationsRead && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}</button>
              <Link href="/profile" className="flex items-center gap-2 rounded-full pl-1.5 pr-1 sm:gap-2.5" data-testid="link-header-profile">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-[10px] font-bold text-teal-foreground">{(user?.username ?? 'LC').slice(0, 2).toUpperCase()}</span><span className="hidden text-xs font-bold sm:inline">{user?.username ?? 'Laura C.'}</span><ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1240px] px-4 pb-28 pt-7 sm:px-8 md:pb-10 md:pt-10">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden" aria-label="Navegación móvil">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
          return <Link href={item.href} key={item.href} className={cn('flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-muted-foreground', active && 'text-primary')} data-testid={`link-mobile-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon className="h-[19px] w-[19px]" /><span>{item.label === 'Conexiones' ? 'Conexiones' : item.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}