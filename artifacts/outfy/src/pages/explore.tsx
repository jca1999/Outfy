import { SlidersHorizontal, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ActivityCard } from '@/components/activity-card';
import { filterCategories } from '@/constants';
import type { Activity } from '@/types';
import { cn } from '@/utils';

interface ExploreProps {
  activities: Activity[];
  saved: Set<string>;
  interested: Set<string>;
  onSave: (id: string) => void;
  onInterest: (id: string) => void;
}

export function Explore({ activities, saved, interested, onSave, onInterest }: ExploreProps) {
  const [location] = useLocation();
  const linkedCategory = new URLSearchParams(location.split('?')[1] ?? '').get('category');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(linkedCategory ?? 'Todas');
  const [day, setDay] = useState('Cualquier día');
  const filtered = useMemo(() => activities.filter((item) => {
    const matchesQuery = `${item.title} ${item.category} ${item.location} ${item.neighborhood}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'Todas' || item.category === category;
    const matchesDay = day === 'Cualquier día' || item.day === day;
    return matchesQuery && matchesCategory && matchesDay;
  }), [activities, category, day, query]);
  return (
    <div className="space-y-7">
      <div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">Elige tu siguiente plan</p><div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><h1 className="text-4xl font-bold tracking-[-.06em] sm:text-5xl">Explorar</h1><p className="max-w-[300px] text-sm leading-relaxed text-muted-foreground">Actividades compartidas en Zaragoza, ordenadas para que salir sea fácil.</p></div></div>
      <div className="rounded-[22px] border border-border bg-card p-3 soft-shadow sm:p-4">
        <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-3"><Search className="h-5 w-5 text-primary" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca por actividad, lugar o barrio" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" data-testid="input-search-activities" />{query && <button type="button" onClick={() => setQuery('')} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Limpiar búsqueda" data-testid="button-clear-search"><X className="h-4 w-4" /></button>}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><SlidersHorizontal className="mr-1 h-4 w-4 text-muted-foreground" />{filterCategories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={cn('rounded-full border px-3 py-1.5 text-[11px] font-bold transition', category === item ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:border-foreground/40')} data-testid={`button-filter-${item}`}>{item}</button>)}<select value={day} onChange={(event) => setDay(event.target.value)} className="ml-auto rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground outline-none" data-testid="select-filter-day"><option>Cualquier día</option><option>Hoy</option><option>Mañana</option><option>Sáb, 26 oct</option><option>Dom, 27 oct</option></select></div>
      </div>
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground"><strong className="text-foreground">{filtered.length}</strong> planes encontrados</p><span className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Más recientes</span></div>
      {filtered.length > 0 ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((activity, index) => <div key={activity.id} className="animate-rise-in" style={{ animationDelay: `${index * 55}ms` }}><ActivityCard activity={activity} saved={saved.has(activity.id)} interested={interested.has(activity.id)} onSave={onSave} onInterest={onInterest} /></div>)}</div> : <div className="rounded-[24px] border border-dashed border-border bg-card p-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><Search className="h-5 w-5" /></div><h2 className="mt-4 text-lg font-bold">No hay un plan así todavía</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Prueba con otro término o quita algún filtro. Zaragoza guarda más planes de los que parece.</p><button type="button" onClick={() => { setQuery(''); setCategory('Todas'); setDay('Cualquier día'); }} className="mt-5 rounded-full bg-foreground px-4 py-2.5 text-xs font-bold text-background" data-testid="button-reset-filters">Limpiar filtros</button></div>}
    </div>
  );
}