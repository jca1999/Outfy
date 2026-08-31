import { Bookmark, CalendarDays, Check, Clock3, MapPin, Users } from 'lucide-react';
import { categoryMeta } from '@/constants';
import type { Activity } from '@/types';
import { cn } from '@/utils';

interface ActivityCardProps {
  activity: Activity;
  saved: boolean;
  interested: boolean;
  onSave: (id: string) => void;
  onInterest: (id: string) => void;
  compact?: boolean;
}

export function ActivityCard({
  activity,
  saved,
  interested,
  onSave,
  onInterest,
  compact = false,
}: ActivityCardProps) {
  const meta = categoryMeta[activity.category];
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[22px] border border-border bg-card p-4 soft-shadow lift-on-hover',
        compact ? 'min-w-[285px] max-w-[320px]' : 'w-full',
      )}
      data-testid={`card-activity-${activity.id}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xs font-bold tracking-[.12em]', `tone-${activity.tone}`)}>
          {meta.short}
        </div>
        <div className="flex items-center gap-2">
          {activity.featured && <span className="rounded-full bg-accent/60 px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[.12em] text-accent-foreground">Para ti</span>}
          <button
            type="button"
            onClick={() => onSave(activity.id)}
            className={cn('tap-scale rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground', saved && 'bg-primary/10 text-primary')}
            aria-label={saved ? 'Quitar de guardados' : 'Guardar actividad'}
            data-testid={`button-save-activity-${activity.id}`}
          >
            <Bookmark className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <div className="mb-3">
        <span className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">{activity.category}</span>
        <h3 className="mt-1 text-[17px] font-bold leading-tight text-card-foreground">{activity.title}</h3>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-primary" />{activity.date}</p>
        <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-primary" />{activity.time} · {activity.location}</p>
        {!compact && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" />{activity.neighborhood}, Zaragoza</p>}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />{activity.participants}/{activity.capacity} personas</span>
        <button
          type="button"
          onClick={() => onInterest(activity.id)}
          className={cn(
            'tap-scale rounded-full px-3 py-1.5 text-xs font-bold',
            interested ? 'bg-secondary text-secondary-foreground' : 'bg-foreground text-background hover:bg-primary',
          )}
          data-testid={`button-interest-activity-${activity.id}`}
        >
          {interested ? <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Me apunto</span> : 'Me interesa'}
        </button>
      </div>
    </article>
  );
}