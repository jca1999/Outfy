import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Users,
} from 'lucide-react';
import {
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { useAuth } from '@/auth/auth-context';
import type { HomeLocation } from '@/auth/auth-api';
import {
  ActivityApiError,
  createActivity,
  type CreateActivityRequest,
} from '@/activities/activity-api';
import {
  activityTaxonomy,
  type ActivityCategoryId,
  type ActivityLocationType,
  type ActivitySubcategoryId,
} from '@/activity-taxonomy';

type ParticipationMode = 'limited' | 'unlimited';
type CostType = 'free' | 'paid' | 'each_own';
type Currency = 'EUR' | 'USD';

type ActivityForm = {
  title: string;
  description: string;
  category: ActivityCategoryId | '';
  subcategory: ActivitySubcategoryId | '';
  date: string;
  startTime: string;
  endTime: string;
  locationType: ActivityLocationType;
  city: string;
  meetingPoint: string;
  onlinePlatform: string;
  participation: ParticipationMode;
  maxParticipants: string;
  cost: CostType;
  estimatedCost: string;
  currency: Currency;
};

const initialForm: ActivityForm = {
  title: '',
  description: '',
  category: '',
  subcategory: '',
  date: '',
  startTime: '',
  endTime: '',
  locationType: 'physical',
  city: '',
  meetingPoint: '',
  onlinePlatform: '',
  participation: 'limited',
  maxParticipants: '',
  cost: 'free',
  estimatedCost: '',
  currency: 'EUR',
};

const inputClassName =
  'w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15';

const choiceLabelClassName =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition';

export function CreateActivity() {
  const { t, i18n } = useTranslation('activities');
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<ActivityForm>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cityMessage, setCityMessage] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [savedLocation, setSavedLocation] =
    useState<HomeLocation | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishedActivityId, setPublishedActivityId] =
    useState<string | null>(null);

  const categoryIds = Object.keys(
    activityTaxonomy,
  ) as ActivityCategoryId[];

  const subcategoryIds = form.category
    ? activityTaxonomy[form.category]
    : [];

  function clearError(key: string) {
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateForm<Key extends keyof ActivityForm>(
    key: Key,
    value: ActivityForm[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    clearError(String(key));

    if (key === 'city') {
      setCityMessage('');
      setSavedLocation(null);
    }
  }

  function handleUseSavedCity() {
    const savedCity =
      user?.homeLocation?.city?.trim() ||
      user?.homeCity?.trim() ||
      '';

    if (!savedCity) {
      setCityMessage(
        t('create.where.noSavedCity'),
      );
      return;
    }

    updateForm('city', savedCity);
    setSavedLocation(user?.homeLocation ?? null);
    setCityMessage(
      t('create.where.savedCityUsed'),
    );
  }

  function openNativePicker(
    event: MouseEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;

    if (typeof input.showPicker !== 'function') {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // Keep the browser's normal input behavior as fallback.
    }
  }

  function validateForm() {
    const nextErrors: Record<string, string> = {};

    if (!form.title.trim()) {
      nextErrors.title = t('create.validation.title');
    }

    if (!form.category) {
      nextErrors.category = t(
        'create.validation.category',
      );
    }

    if (!form.subcategory) {
      nextErrors.subcategory = t(
        'create.validation.subcategory',
      );
    }

    if (!form.date) {
      nextErrors.date = t('create.validation.date');
    }

    if (!form.startTime) {
      nextErrors.startTime = t(
        'create.validation.startTime',
      );
    }

    if (
      form.startTime &&
      form.endTime &&
      form.endTime <= form.startTime
    ) {
      nextErrors.endTime = t(
        'create.validation.endTimeBeforeStart',
      );
    }

    if (
      form.locationType === 'physical' &&
      !form.city.trim()
    ) {
      nextErrors.city = t('create.validation.city');
    }

    if (form.participation === 'limited') {
      const maxParticipants = Number(
        form.maxParticipants,
      );

      if (
        !Number.isInteger(maxParticipants) ||
        maxParticipants < 2
      ) {
        nextErrors.maxParticipants = t(
          'create.validation.maxParticipants',
        );
      }
    }

    if (form.cost === 'paid') {
      const estimatedCost = Number(form.estimatedCost);

      if (
        !form.estimatedCost ||
        !Number.isFinite(estimatedCost) ||
        estimatedCost <= 0
      ) {
        nextErrors.estimatedCost = t(
          'create.validation.estimatedCost',
        );
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validateForm()) {
      setIsPreview(true);
    }
  }

  async function handlePublish() {
    if (isPublishing) {
      return;
    }

    setIsPublishing(true);
    setPublishError('');

    const startsAt = new Date(
      `${form.date}T${form.startTime}:00`,
    ).toISOString();
    const endsAt = form.endTime
      ? new Date(`${form.date}T${form.endTime}:00`).toISOString()
      : undefined;
    const timezoneName =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    const input: CreateActivityRequest = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      subcategory: form.subcategory,
      startsAt,
      endsAt,
      timezoneName,
      locationType: form.locationType,
      participationMode: form.participation,
      maxParticipants:
        form.participation === 'limited'
          ? Number(form.maxParticipants)
          : undefined,
      costType: form.cost,
      estimatedCost:
        form.cost === 'paid'
          ? Number(form.estimatedCost)
          : undefined,
      currency: form.cost === 'paid' ? form.currency : undefined,
      ...(form.locationType === 'physical'
        ? {
            city: form.city.trim(),
            meetingPoint: form.meetingPoint.trim() || undefined,
            countryCode: savedLocation?.countryCode,
            regionCode: savedLocation?.regionCode ?? undefined,
            regionName: savedLocation?.region ?? undefined,
            latitude: savedLocation?.latitude,
            longitude: savedLocation?.longitude,
          }
        : {
            onlinePlatform:
              form.onlinePlatform.trim() || undefined,
          }),
    };

    try {
      const result = await createActivity(input);
      setPublishedActivityId(result.activity.id);
    } catch (error) {
      setPublishError(
        error instanceof ActivityApiError && error.status === 401
          ? t('create.publish.authError')
          : t('create.publish.error'),
      );
    } finally {
      setIsPublishing(false);
    }
  }

  function handleCreateAnother() {
    setForm(initialForm);
    setErrors({});
    setCityMessage('');
    setSavedLocation(null);
    setIsPreview(false);
    setIsPublishing(false);
    setPublishError('');
    setPublishedActivityId(null);
  }

  function getDateLabel() {
    if (!form.date) {
      return '';
    }

    return new Intl.DateTimeFormat(
      i18n.language === 'en' ? 'en-GB' : 'es-ES',
      { dateStyle: 'long' },
    ).format(new Date(`${form.date}T00:00:00`));
  }

  const categoryLabel = form.category
    ? t(`categories.${form.category}`)
    : '';
  const subcategoryLabel = form.subcategory
    ? t(`subcategories.${form.subcategory}`)
    : '';
  const timeLabel = form.endTime
    ? `${form.startTime} – ${form.endTime}`
    : form.startTime;
  const locationLabel =
    form.locationType === 'physical'
      ? [form.city, form.meetingPoint]
          .filter(Boolean)
          .join(' · ')
      : form.onlinePlatform ||
        t('create.preview.onlineNoPlatform');
  const participantsLabel =
    form.participation === 'limited'
      ? t('create.preview.participantsLimited', {
          count: Number(form.maxParticipants),
        })
      : t('create.preview.participantsUnlimited');
  const costLabel =
    form.cost === 'free'
      ? t('create.cost.free')
      : form.cost === 'each_own'
        ? t('create.cost.eachOwn')
        : `${form.estimatedCost} ${t(
            `create.cost.currencies.${form.currency.toLowerCase()}`,
          )}`;

  function renderError(key: string) {
    if (!errors[key]) {
      return null;
    }

    return (
      <p
        id={`${key}-error`}
        className="mt-2 text-xs font-semibold text-destructive"
        role="alert"
      >
        {errors[key]}
      </p>
    );
  }

  function renderChoice(
    name: string,
    value: string,
    label: string,
    checked: boolean,
    onChange: () => void,
    key?: string,
  ) {
    return (
      <label
        key={key}
        className={`${choiceLabelClassName} ${
          checked
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-border text-muted-foreground hover:border-primary/40'
        }`}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 accent-primary"
        />
        <span>{label}</span>
      </label>
    );
  }

  if (publishedActivityId) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-[26px] border border-border bg-card p-6 text-center soft-shadow sm:p-10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <p className="mt-5 font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-primary">
          {t('create.success.eyebrow')}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
          {t('create.success.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('create.success.message')}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              navigate(`/activities/${publishedActivityId}`)
            }
            className="outfy-primary-action rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            {t('create.actions.viewPlan')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full border border-border px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {t('create.actions.backHome')}
          </button>
          <button
            type="button"
            onClick={handleCreateAnother}
            className="rounded-full border border-border px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {t('create.actions.createAnother')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/')}
          disabled={isPublishing}
          className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('create.back')}
        </button>

        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
          {t(
            isPreview
              ? 'create.preview.eyebrow'
              : 'create.eyebrow',
          )}
        </p>

        <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
          {t(
            isPreview
              ? 'create.preview.title'
              : 'create.title',
          )}
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t(
            isPreview
              ? 'create.preview.intro'
              : 'create.intro',
          )}
        </p>
      </div>

      {isPreview ? (
        <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-8">
          <div className="flex items-center gap-2 text-primary">
            <CalendarDays className="h-4 w-4" />
            <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em]">
              {t('create.preview.eyebrow')}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.what.titleLabel')}
              </dt>
              <dd className="mt-1 text-2xl font-bold tracking-[-.04em]">
                {form.title}
              </dd>
            </div>

            {form.description.trim() && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                  {t('create.preview.description')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {form.description.trim()}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.category')}
              </dt>
              <dd className="mt-1 text-sm font-semibold">
                {categoryLabel}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.subcategory')}
              </dt>
              <dd className="mt-1 text-sm font-semibold">
                {subcategoryLabel}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.date')}
              </dt>
              <dd className="mt-1 text-sm font-semibold">
                {getDateLabel()}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.time')}
              </dt>
              <dd className="mt-1 text-sm font-semibold">
                {timeLabel}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.location')}
              </dt>
              <dd className="mt-1 flex items-start gap-2 text-sm font-semibold">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{locationLabel}</span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.participants')}
              </dt>
              <dd className="mt-1 flex items-start gap-2 text-sm font-semibold">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{participantsLabel}</span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t('create.preview.cost')}
              </dt>
              <dd className="mt-1 text-sm font-semibold">
                {costLabel}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsPreview(false)}
              disabled={isPublishing}
              className="rounded-full border border-border px-4 py-3 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('create.actions.backToEdit')}
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              {publishError && (
                <p className="text-xs font-semibold text-destructive" role="alert">
                  {publishError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="outfy-primary-action inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {t(
                isPublishing
                  ? 'create.actions.publishing'
                  : 'create.actions.publish',
              )}
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5"
        >
          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t('create.sections.what')}
              </h2>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="activity-title"
                  className="text-sm font-bold"
                >
                  {t('create.what.titleLabel')}
                </label>
                <input
                  id="activity-title"
                  type="text"
                  value={form.title}
                  onChange={(event) =>
                    updateForm('title', event.target.value)
                  }
                  placeholder={t(
                    'create.what.titlePlaceholder',
                  )}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={
                    errors.title
                      ? 'title-error'
                      : undefined
                  }
                  className={`${inputClassName} mt-2`}
                />
                {renderError('title')}
              </div>

              <div>
                <label
                  htmlFor="activity-description"
                  className="text-sm font-bold"
                >
                  {t('create.what.descriptionLabel')}
                </label>
                <textarea
                  id="activity-description"
                  value={form.description}
                  onChange={(event) =>
                    updateForm(
                      'description',
                      event.target.value,
                    )
                  }
                  placeholder={t(
                    'create.what.descriptionPlaceholder',
                  )}
                  rows={3}
                  className={`${inputClassName} mt-2 resize-y`}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="activity-category"
                    className="text-sm font-bold"
                  >
                    {t('create.what.categoryLabel')}
                  </label>
                  <select
                    id="activity-category"
                    value={form.category}
                    onChange={(event) => {
                      const value =
                        event.target.value as
                          | ActivityCategoryId
                          | '';
                      setForm((current) => ({
                        ...current,
                        category: value,
                        subcategory: '',
                      }));
                      clearError('category');
                      clearError('subcategory');
                    }}
                    aria-invalid={Boolean(errors.category)}
                    className={`${inputClassName} mt-2`}
                  >
                    <option value="">
                      {t(
                        'create.what.categoryPlaceholder',
                      )}
                    </option>
                    {categoryIds.map((category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {t(`categories.${category}`)}
                      </option>
                    ))}
                  </select>
                  {renderError('category')}
                </div>

                {form.category && (
                  <div>
                    <label
                      htmlFor="activity-subcategory"
                      className="text-sm font-bold"
                    >
                      {t(
                        'create.what.subcategoryLabel',
                      )}
                    </label>
                    <select
                      id="activity-subcategory"
                      value={form.subcategory}
                      onChange={(event) =>
                        updateForm(
                          'subcategory',
                          event.target.value as
                            | ActivitySubcategoryId
                            | '',
                        )
                      }
                      aria-invalid={Boolean(
                        errors.subcategory,
                      )}
                      className={`${inputClassName} mt-2`}
                    >
                      <option value="">
                        {t(
                          'create.what.subcategoryPlaceholder',
                        )}
                      </option>
                      {subcategoryIds.map(
                        (subcategory) => (
                          <option
                            key={subcategory}
                            value={subcategory}
                          >
                            {t(
                              `subcategories.${subcategory}`,
                            )}
                          </option>
                        ),
                      )}
                    </select>
                    {renderError('subcategory')}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock3 className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t('create.sections.when')}
              </h2>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="activity-date"
                  className="text-sm font-bold"
                >
                  {t('create.when.dateLabel')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="activity-date"
                    type="date"
                    value={form.date}
                    onClick={openNativePicker}
                    onChange={(event) =>
                      updateForm('date', event.target.value)
                    }
                    aria-invalid={Boolean(errors.date)}
                    aria-describedby={
                      form.date
                        ? undefined
                        : 'activity-date-format'
                    }
                    className={inputClassName}
                  />
                  {!form.date && (
                    <span
                      id="activity-date-format"
                      className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-muted-foreground/65"
                    >
                      {t('create.when.dateFormatHint')}
                    </span>
                  )}
                </div>
                {renderError('date')}
              </div>

              <div>
                <label
                  htmlFor="activity-start-time"
                  className="text-sm font-bold"
                >
                  {t('create.when.startTimeLabel')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="activity-start-time"
                    type="time"
                    value={form.startTime}
                    onClick={openNativePicker}
                    onChange={(event) =>
                      updateForm(
                        'startTime',
                        event.target.value,
                      )
                    }
                    aria-invalid={Boolean(errors.startTime)}
                    aria-describedby={
                      form.startTime
                        ? undefined
                        : 'activity-start-time-format'
                    }
                    className={inputClassName}
                  />
                  {!form.startTime && (
                    <span
                      id="activity-start-time-format"
                      className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-muted-foreground/65"
                    >
                      {t('create.when.timeFormatHint')}
                    </span>
                  )}
                </div>
                {renderError('startTime')}
              </div>

              <div>
                <label
                  htmlFor="activity-end-time"
                  className="text-sm font-bold"
                >
                  {t('create.when.endTimeLabel')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="activity-end-time"
                    type="time"
                    value={form.endTime}
                    onClick={openNativePicker}
                    onChange={(event) =>
                      updateForm(
                        'endTime',
                        event.target.value,
                      )
                    }
                    aria-invalid={Boolean(errors.endTime)}
                    aria-describedby={
                      form.endTime
                        ? undefined
                        : 'activity-end-time-format'
                    }
                    className={inputClassName}
                  />
                  {!form.endTime && (
                    <span
                      id="activity-end-time-format"
                      className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-muted-foreground/65"
                    >
                      {t('create.when.timeFormatHint')}
                    </span>
                  )}
                </div>
                {renderError('endTime')}
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t('create.sections.where')}
              </h2>
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-bold">
                {t('create.where.typeLabel')}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  ['physical', 'online'] as ActivityLocationType[]
                ).map((locationType) =>
                  renderChoice(
                    'activity-location-type',
                    locationType,
                    t(`locationTypes.${locationType}`),
                    form.locationType === locationType,
                    () =>
                      updateForm(
                        'locationType',
                        locationType,
                      ),
                    locationType,
                  ),
                )}
              </div>
            </fieldset>

            <div className="mt-5">
              {form.locationType === 'physical' ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="activity-city"
                        className="text-sm font-bold"
                      >
                        {t('create.where.cityLabel')}
                      </label>

                      <button
                        type="button"
                        onClick={handleUseSavedCity}
                        className="text-xs font-bold text-primary transition hover:text-primary/75"
                      >
                        {t('create.where.useSavedCity')}
                      </button>
                    </div>
                    <input
                      id="activity-city"
                      type="text"
                      value={form.city}
                      onChange={(event) =>
                        updateForm(
                          'city',
                          event.target.value,
                        )
                      }
                      placeholder={t(
                        'create.where.cityPlaceholder',
                      )}
                      aria-invalid={Boolean(errors.city)}
                      className={`${inputClassName} mt-2`}
                    />
                    {renderError('city')}
                    {cityMessage && (
                      <p
                        className="mt-2 text-xs font-semibold text-primary"
                        role="status"
                      >
                        {cityMessage}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="activity-meeting-point"
                      className="text-sm font-bold"
                    >
                      {t(
                        'create.where.meetingPointLabel',
                      )}
                    </label>
                    <input
                      id="activity-meeting-point"
                      type="text"
                      value={form.meetingPoint}
                      onChange={(event) =>
                        updateForm(
                          'meetingPoint',
                          event.target.value,
                        )
                      }
                      placeholder={t(
                        'create.where.meetingPointPlaceholder',
                      )}
                      className={`${inputClassName} mt-2`}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="activity-online-platform"
                    className="text-sm font-bold"
                  >
                    {t(
                      'create.where.onlinePlatformLabel',
                    )}
                  </label>
                  <input
                    id="activity-online-platform"
                    type="text"
                    value={form.onlinePlatform}
                    onChange={(event) =>
                      updateForm(
                        'onlinePlatform',
                        event.target.value,
                      )
                    }
                    placeholder={t(
                      'create.where.onlinePlatformPlaceholder',
                    )}
                    className={`${inputClassName} mt-2`}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t('create.sections.people')}
              </h2>
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-bold">
                {t('create.people.limitLabel')}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {renderChoice(
                  'activity-participation',
                  'limited',
                  t('create.people.limited'),
                  form.participation === 'limited',
                  () =>
                    updateForm(
                      'participation',
                      'limited',
                    ),
                )}
                {renderChoice(
                  'activity-participation',
                  'unlimited',
                  t('create.people.unlimited'),
                  form.participation === 'unlimited',
                  () =>
                    updateForm(
                      'participation',
                      'unlimited',
                    ),
                )}
              </div>
            </fieldset>

            {form.participation === 'limited' && (
              <div className="mt-5 max-w-sm">
                <label
                  htmlFor="activity-max-participants"
                  className="text-sm font-bold"
                >
                  {t(
                    'create.people.maxParticipantsLabel',
                  )}
                </label>
                <input
                  id="activity-max-participants"
                  type="number"
                  min={2}
                  step={1}
                  inputMode="numeric"
                  value={form.maxParticipants}
                  onChange={(event) =>
                    updateForm(
                      'maxParticipants',
                      event.target.value,
                    )
                  }
                  placeholder={t(
                    'create.people.maxParticipantsPlaceholder',
                  )}
                  aria-invalid={Boolean(
                    errors.maxParticipants,
                  )}
                  className={`${inputClassName} mt-2`}
                />
                {renderError('maxParticipants')}
              </div>
            )}
          </section>

          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <span className="text-sm font-bold">€</span>
              </span>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t('create.sections.cost')}
              </h2>
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-bold">
                {t('create.cost.typeLabel')}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {renderChoice(
                  'activity-cost',
                  'free',
                  t('create.cost.free'),
                  form.cost === 'free',
                  () =>
                    updateForm('cost', 'free'),
                )}
                {renderChoice(
                  'activity-cost',
                  'paid',
                  t('create.cost.paid'),
                  form.cost === 'paid',
                  () =>
                    updateForm('cost', 'paid'),
                )}
                {renderChoice(
                  'activity-cost',
                  'each_own',
                  t('create.cost.eachOwn'),
                  form.cost === 'each_own',
                  () =>
                    updateForm('cost', 'each_own'),
                )}
              </div>
            </fieldset>

            {form.cost === 'paid' && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="activity-estimated-cost"
                    className="text-sm font-bold"
                  >
                    {t(
                      'create.cost.estimatedCostLabel',
                    )}
                  </label>
                  <input
                    id="activity-estimated-cost"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={form.estimatedCost}
                    onChange={(event) =>
                      updateForm(
                        'estimatedCost',
                        event.target.value,
                      )
                    }
                    placeholder={t(
                      'create.cost.estimatedCostPlaceholder',
                    )}
                    aria-invalid={Boolean(
                      errors.estimatedCost,
                    )}
                    className={`${inputClassName} mt-2`}
                  />
                  {renderError('estimatedCost')}
                </div>

                <div>
                  <label
                    htmlFor="activity-currency"
                    className="text-sm font-bold"
                  >
                    {t('create.cost.currencyLabel')}
                  </label>
                  <select
                    id="activity-currency"
                    value={form.currency}
                    onChange={(event) =>
                      updateForm(
                        'currency',
                        event.target.value as Currency,
                      )
                    }
                    className={`${inputClassName} mt-2`}
                  >
                    <option value="EUR">
                      {t('create.cost.currencies.eur')}
                    </option>
                    <option value="USD">
                      {t('create.cost.currencies.usd')}
                    </option>
                  </select>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="outfy-primary-action inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 sm:w-auto"
            >
              {t('create.actions.review')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}