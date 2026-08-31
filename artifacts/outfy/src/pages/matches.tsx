import { Check, Heart, MessageCircle, Sparkles, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { people } from '@/mock-data';
import type { Person } from '@/types';
import { cn } from '@/utils';

export function Matches() {
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = people.filter((person) => !dismissed.has(person.id));
  const toggleConnection = (id: string) => setConnected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">Gente con tu ritmo</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">Conexiones</h1></div><div className="flex items-center gap-2 rounded-full bg-accent/50 px-3 py-2 text-xs font-semibold text-accent-foreground"><Sparkles className="h-3.5 w-3.5" /> Basado en tus intereses</div></div>
      <div className="rounded-[22px] bg-sidebar p-5 text-sidebar-foreground sm:flex sm:items-center sm:justify-between sm:p-6"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/55">No es una cita</p><h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">Encuentra tu próxima cuadrilla.</h2><p className="mt-2 max-w-lg text-sm text-sidebar-foreground/65">Personas de Zaragoza que comparten planes contigo. Conecta primero por lo que os apetece hacer.</p></div><Heart className="mt-5 hidden h-16 w-16 text-primary/80 sm:mt-0 sm:block" strokeWidth={1.2} /></div>
      {visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{visible.map((person, index) => <PersonCard key={person.id} person={person} connected={connected.has(person.id)} onConnect={toggleConnection} onDismiss={(id) => setDismissed((current) => new Set(current).add(id))} index={index} />)}</div> : <div className="rounded-[24px] border border-dashed border-border bg-card p-12 text-center"><UserRound className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 text-lg font-bold">Has visto todas las conexiones</h2><p className="mt-1 text-sm text-muted-foreground">Vuelve más tarde para descubrir gente nueva.</p></div>}
    </div>
  );
}

function PersonCard({ person, connected, onConnect, onDismiss, index }: { person: Person; connected: boolean; onConnect: (id: string) => void; onDismiss: (id: string) => void; index: number }) {
  return <article className="animate-rise-in rounded-[22px] border border-border bg-card p-4 soft-shadow" style={{ animationDelay: `${index * 70}ms` }} data-testid={`card-person-${person.id}`}>
    <div className="flex items-start justify-between"><div className={cn('flex h-16 w-16 items-center justify-center rounded-[20px] text-sm font-bold', `tone-${person.color}`)}>{person.initials}</div><button type="button" onClick={() => onDismiss(person.id)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Descartar a ${person.name}`} data-testid={`button-dismiss-person-${person.id}`}><X className="h-4 w-4" /></button></div>
    <div className="mt-4"><h2 className="text-lg font-bold">{person.name}, {person.age}</h2><p className="text-xs text-muted-foreground">{person.occupation}</p><p className="mt-3 min-h-[55px] text-sm leading-relaxed text-muted-foreground">{person.bio}</p></div>
    <div className="mt-3 flex flex-wrap gap-1.5">{person.interests.map((interest) => <span key={interest} className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{interest}</span>)}</div>
    <div className="mt-4 flex items-center gap-2 border-t border-border pt-3"><span className="font-mono-ui text-[10px] font-bold text-primary">{person.compatibility}%</span><span className="text-[10px] text-muted-foreground">afinidad en intereses</span></div>
    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-teal" />{person.active}</p>
    <div className="mt-4 flex gap-2"><button type="button" onClick={() => onConnect(person.id)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition', connected ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground')} data-testid={`button-connect-person-${person.id}`}>{connected ? <><Check className="h-3.5 w-3.5" /> Conectados</> : <><Heart className="h-3.5 w-3.5" /> Conectar</>}</button><button type="button" onClick={() => onConnect(person.id)} className="rounded-xl border border-border px-3 text-muted-foreground hover:bg-muted" aria-label={`Conectar con ${person.name} para escribir`} data-testid={`button-message-person-${person.id}`}><MessageCircle className="h-4 w-4" /></button></div>
  </article>;
}