import {
  AlertCircle,
  Calendar,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { getActivities, type ExploreActivity } from '@/activities/activity-api';
import { activityTaxonomy, type ActivityCategoryId } from '@/activity-taxonomy';
import type { Activity } from '@/types';
import { cn } from '@/utils';

interface ExploreProps {
  activities: Activity[];
  saved: Set<string>;
  interested: Set<string>;
  onSave: (id: string) => void;
  onInterest: (id: string) => void;
}

const categoryIds = Object.keys(activityTaxonomy) as ActivityCategoryId[];
type CategoryKey = 'all' | ActivityCategoryId;
const categoriesList = ['all', ...categoryIds] as const;

function RealActivityCard({ activity }: { activity: ExploreActivity }) {
  const { t, i18n } = useTranslation('activities');
  const isFull = Boolean(
    activity.participationMode === 'limited' &&
    activity.maxParticipants &&
    activity.memberCount >= activity.maxParticipants
  );

  const dateObj = new Date(activity.startsAt);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: activity.timezoneName,
  });
  const timeFormatter = new Intl.DateTimeFormat(i18n.language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: activity.timezoneName,
  });

  const dateStr = dateFormatter.format(dateObj);
  const timeStr = timeFormatter.format(dateObj);

  const capitalizeFirst = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);

  return (
    <Link
      href={`/activities/${activity.id}`}
      className="group flex h-full flex-col justify-between overflow-hidden rounded-[24px] border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
              {t(`categories.${activity.category}`)}
            </span>
            {isFull && (
              <span className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-destructive">
                {t('explore.full')}
              </span>
            )}
          </div>
        </div>

        <h3 className="line-clamp-2 text-lg font-bold leading-tight group-hover:underline">
          {activity.title}
        </h3>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-foreground/40" />
            <span>{capitalizeFirst(dateStr)} • {timeStr}</span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-foreground/40" />
            <span className="truncate">
              {activity.locationType === 'online'
                ? t('locationTypes.online')
                : activity.city || ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-foreground/40" />
            <span>
              {activity.participationMode === 'limited'
                ? t('create.detail.participantsLimited', {
                    count: activity.memberCount,
                    max: activity.maxParticipants
                  })
                : t('create.detail.participantsUnlimited', {
                    count: activity.memberCount
                  })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Explore(_props: ExploreProps) {
  const { t } = useTranslation('activities');
  const [location] = useLocation();
  const linkedCategory = new URLSearchParams(location.split('?')[1] ?? '').get('category');

  const initialCategory: CategoryKey =
    linkedCategory && linkedCategory in activityTaxonomy
      ? (linkedCategory as ActivityCategoryId)
      : 'all';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<CategoryKey>(initialCategory);

  const [state, setState] = useState<{
    data: ExploreActivity[] | null;
    loading: boolean;
    error: boolean;
  }>({ data: null, loading: true, error: false });

  const fetchIdRef = useRef(0);

  const loadActivities = useCallback(async (search: string, cat: CategoryKey) => {
    const id = ++fetchIdRef.current;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    try {
      const res = await getActivities({
        search: search || undefined,
        category: cat === 'all' ? undefined : cat,
      });
      if (id === fetchIdRef.current) {
        setState({ data: res.activities, loading: false, error: false });
      }
    } catch {
      if (id === fetchIdRef.current) {
        setState((previous) => ({
          ...previous,
          loading: false,
          error: true,
        }));
      }
    }
  }, []);

  useEffect(() => {
    fetchIdRef.current += 1;
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    loadActivities(debouncedQuery, category);
  }, [debouncedQuery, category, loadActivities]);

  const handleClearSearch = () => {
    setQuery('');
  };

  const handleResetFilters = () => {
    setQuery('');
    setCategory('all');
  };

  return (
    <div className="space-y-7 pb-20">
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
          {t('explore.eyebrow')}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <h1 className="text-4xl font-bold tracking-[-.06em] sm:text-5xl">{t('explore.title')}</h1>
          <p className="max-w-[300px] text-sm leading-relaxed text-muted-foreground">{t('explore.intro')}</p>
        </div>
      </div>

      <div className="rounded-[22px] border border-border bg-card p-3 soft-shadow sm:p-4">
        <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-3">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 100))}
            placeholder={t('explore.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            data-testid="input-search-activities"
          />
          {query && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label={t('explore.clearSearch')}
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <SlidersHorizontal className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
          {categoriesList.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => {
                fetchIdRef.current += 1;
                setCategory(item);
              }}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
                category === item
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/40'
              )}
              data-testid={`button-filter-${item}`}
            >
              {item === 'all' ? t('explore.allCategories') : t(`categories.${item}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {state.data && !state.error ? (
              <strong className="font-medium text-foreground">
                {t('explore.results', { count: state.data.length })}
              </strong>
            ) : (
              <span className="invisible">0</span>
            )}
          </p>
          {state.loading && state.data && (
            <span
              className="animate-pulse text-xs font-medium text-muted-foreground"
              aria-live="polite"
            >
              {t('explore.loading')}...
            </span>
          )}
        </div>
        <span className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
          {t('explore.upcomingFirst')}
        </span>
      </div>

      <div className="min-h-[400px]">
        {state.error ? (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-card p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold">{t('explore.loadError')}</h2>
            <button
              type="button"
              onClick={() => loadActivities(debouncedQuery, category)}
              className="mt-5 flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-xs font-bold text-background"
            >
              <RefreshCw className="h-4 w-4" />
              {t('explore.retry')}
            </button>
          </div>
        ) : state.loading && !state.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[180px] animate-pulse rounded-[24px] bg-muted" />
            ))}
          </div>
        ) : state.data && state.data.length > 0 ? (
          <div
            className={cn(
              'grid gap-4 transition-opacity duration-300 sm:grid-cols-2 xl:grid-cols-3',
              state.loading && 'opacity-60',
            )}
            aria-busy={state.loading}
          >
            {state.data.map((activity, index) => (
              <div
                key={activity.id}
                className="animate-rise-in"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <RealActivityCard activity={activity} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              <Search className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold">
              {query || category !== 'all'
                ? t('explore.noResultsTitle')
                : t('explore.noPlansTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              {query || category !== 'all'
                ? t('explore.noResultsDescription')
                : t('explore.noPlansDescription')}
            </p>
            {(query || category !== 'all') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-5 rounded-full bg-foreground px-4 py-2.5 text-xs font-bold text-background"
                data-testid="button-reset-filters"
              >
                {t('explore.clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
