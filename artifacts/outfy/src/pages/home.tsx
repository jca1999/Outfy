import { ArrowRight, CalendarDays, ChevronRight, MapPin, Plus, Sparkles, Users } from 'lucide-react';
import { Link } from 'wouter';
import { ActivityCard } from '@/components/activity-card';
import { categoryMeta } from '@/constants';
import type { Activity, ActivityCategory } from '@/types';

interface HomeProps {
  activities: Activity[];
  saved: Set<string>;
  interested: Set<string>;
  onSave: (id: string) => void;
  onInterest: (id: string) => void;
  onCreate: () => void;
}

export function Home({ activities, saved, interested, onSave, onInterest, onCreate }: HomeProps) {
  const recommended = activities.filter((activity) => activity.featured);
  const nearby = activities.filter((activity) => !activity.featured).slice(0, 4);
  const categories: ActivityCategory[] = ['Fútbol', 'Cine', 'Juegos', 'Cañas', 'Senderismo'];
  return (
    <div className="space-y-10">
      <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="relative overflow-hidden rounded-[28px] bg-sidebar p-6 text-sidebar-foreground sm:p-9">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-primary/10" />
          <div className="absolute bottom-[-70px] right-20 h-44 w-44 rounded-full border-[20px] border-primary/10" />
          <p className="relative font-mono-ui text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/70">Jueves, 24 de octubre · Zaragoza</p>
          <h1 className="relative mt-8 max-w-[620px] text-[clamp(2.2rem,5vw,4.2rem)] font-bold leading-[.98] tracking-[-.065em]">Hola, Laura.<br /><span className="text-sidebar-foreground/65">Hoy pasa algo.</span></h1>
          <p className="relative mt-6 max-w-[440px] text-sm leading-relaxed text-sidebar-foreground/80">Planes reales, gente cercana y una excusa para salir de casa. ¿Qué te apetece?</p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <Link href="/explore" className="outfy-primary-action inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-bold text-primary-foreground transition hover:-translate-y-0.5" data-testid="link-hero-explore">Explorar planes <ArrowRight className="h-3.5 w-3.5" /></Link>
            <button type="button" onClick={onCreate} className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-3 text-xs font-bold text-primary transition hover:bg-primary/10" data-testid="button-hero-create"><Plus className="h-3.5 w-3.5" /> Proponer un plan</button>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[28px] bg-sidebar p-6 text-sidebar-foreground sm:p-8">
          <div className="absolute right-[-30px] top-[-30px] h-40 w-40 rounded-full bg-accent/15" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/55"><Sparkles className="h-3.5 w-3.5 text-accent" /> Plan destacado</span>
              <span className="rounded-full bg-sidebar-accent px-2.5 py-1 font-mono-ui text-[9px] text-sidebar-foreground/70">HOY</span>
            </div>
            <div className="mt-12">
              <p className="text-3xl font-bold leading-tight tracking-[-.04em]">Partidito al<br />atardecer</p>
              <div className="mt-5 space-y-2 text-xs text-sidebar-foreground/65"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-primary" />19:30 · Romareda</p><p className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" />8 personas ya dentro</p></div>
            </div>
            <Link href="/explore" className="mt-8 flex items-center justify-between rounded-xl bg-sidebar-primary/15 px-4 py-3 text-xs font-bold text-primary transition hover:bg-sidebar-primary/25" data-testid="link-featured-plan">Ver el plan <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">Tu radar</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Puede encajarte</h2></div><Link href="/explore" className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary" data-testid="link-see-recommended">Ver todos <ChevronRight className="h-4 w-4" /></Link></div>
        <div className="flex gap-4 overflow-x-auto px-1 pb-3">{recommended.map((activity, index) => <div className="animate-float-in" style={{ animationDelay: `${index * 90}ms` }} key={activity.id}><ActivityCard activity={activity} saved={saved.has(activity.id)} interested={interested.has(activity.id)} onSave={onSave} onInterest={onInterest} compact /></div>)}</div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-4 flex items-end justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">A dos pasos</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Cerca de ti</h2></div><span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Zaragoza</span></div>
          <div className="grid gap-4 sm:grid-cols-2">{nearby.slice(0, 4).map((activity) => <ActivityCard key={activity.id} activity={activity} saved={saved.has(activity.id)} interested={interested.has(activity.id)} onSave={onSave} onInterest={onInterest} />)}</div>
        </div>
        <aside className="rounded-[22px] border border-border bg-secondary/55 p-5">
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-secondary-foreground/60">¿Sin plan?</p>
          <h3 className="mt-3 text-xl font-bold leading-tight tracking-[-.04em] text-secondary-foreground">Empieza por lo que ya te gusta.</h3>
          <div className="mt-5 space-y-2">{categories.map((category) => { const meta = categoryMeta[category]; return <Link href={`/explore?category=${category}`} key={category} className="flex items-center justify-between rounded-xl bg-card/70 px-3 py-2.5 text-xs font-semibold transition hover:bg-card" data-testid={`link-category-${category}`}><span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full tone-dot-${meta.tone}`} />{meta.label}</span><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>; })}</div>
        </aside>
      </section>
      <section className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-dashed border-primary/40 bg-primary/5 p-5 sm:flex-row sm:items-center sm:px-6">
        <div><p className="text-sm font-bold">Lo mejor de Outfy lo propone la gente.</p><p className="mt-1 text-xs text-muted-foreground">¿Tienes una idea sencilla para esta semana?</p></div>
        <button type="button" onClick={onCreate} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="button-create-bottom"><Plus className="h-3.5 w-3.5" /> Crear un plan</button>
      </section>
    </div>
  );
}