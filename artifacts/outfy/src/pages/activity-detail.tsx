import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Edit3,
  MapPin,
  Share2,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useRoute } from "wouter";

import {
  ActivityApiError,
  cancelActivity,
  getActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail as Activity,
} from "@/activities/activity-api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type LoadState = "loading" | "ready" | "not-found" | "unauthorized" | "error";

export function ActivityDetail() {
  const { t, i18n } = useTranslation("activities");
  const [, params] = useRoute("/activities/:id");
  const [, navigate] = useLocation();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [shareMessage, setShareMessage] = useState("");
  const [membershipPending, setMembershipPending] = useState<
    "join" | "leave" | null
  >(null);
  const [membershipError, setMembershipError] = useState("");
  const [membershipUnavailable, setMembershipUnavailable] = useState(false);
  const [organizerActionPending, setOrganizerActionPending] = useState(false);
  const [organizerActionError, setOrganizerActionError] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const membershipRequestRef = useRef<symbol | null>(null);
  const currentActivityIdRef = useRef<string | null>(params?.id ?? null);
  currentActivityIdRef.current = params?.id ?? null;

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    setActivity(null);
    setMembershipPending(null);
    setMembershipError("");
    setMembershipUnavailable(false);
    setOrganizerActionPending(false);
    setOrganizerActionError('');
    setCancelDialogOpen(false);
    membershipRequestRef.current = null;

    if (!params?.id) {
      setLoadState("not-found");
      return () => {
        active = false;
      };
    }

    getActivity(params.id)
      .then((result) => {
        if (!active) return;
        setActivity(result.activity);
        setLoadState("ready");
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ActivityApiError && error.status === 401) {
          setLoadState("unauthorized");
        } else if (error instanceof ActivityApiError && error.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [params?.id]);

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  }

  async function handleShare() {
    if (!activity) return;
    setShareMessage("");
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: activity.title,
          text: t("create.detail.shareInvitation"),
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setShareMessage(t("create.detail.shareError"));
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(t("create.detail.linkCopied"));
    } catch {
      setShareMessage(t("create.detail.shareError"));
    }
  }

  async function handleJoin() {
    if (!activity || membershipRequestRef.current) return;

    const activityId = activity.id;
    const requestToken = Symbol("join-activity");
    membershipRequestRef.current = requestToken;
    setMembershipPending("join");
    setMembershipError("");
    try {
      const result = await joinActivity(activityId);
      if (
        membershipRequestRef.current !== requestToken ||
        currentActivityIdRef.current !== activityId
      ) {
        return;
      }
      setActivity((current) =>
        current?.id === activityId
          ? {
              ...current,
              membershipRole: "participant",
              memberCount: result.memberCount,
              maxParticipants: result.maxParticipants,
            }
          : current,
      );
    } catch (error) {
      if (
        membershipRequestRef.current !== requestToken ||
        currentActivityIdRef.current !== activityId
      ) {
        return;
      }
      if (error instanceof ActivityApiError) {
        if (error.code === "activity_full") {
          setMembershipError(t("create.detail.joinFullError"));
          if (typeof error.memberCount === "number") {
            setActivity((current) =>
              current?.id === activityId
                ? {
                    ...current,
                    memberCount: error.memberCount!,
                    maxParticipants:
                      error.maxParticipants ?? current.maxParticipants,
                  }
                : current,
            );
          }
        } else if (error.code === "activity_not_active") {
          setMembershipUnavailable(true);
          setMembershipError(t("create.detail.joinInactiveError"));
        } else if (error.status === 401) {
          setMembershipError(t("create.detail.sessionErrorMessage"));
        } else {
          setMembershipError(t("create.detail.joinError"));
        }
      } else {
        setMembershipError(t("create.detail.joinError"));
      }
    } finally {
      if (
        membershipRequestRef.current === requestToken &&
        currentActivityIdRef.current === activityId
      ) {
        membershipRequestRef.current = null;
        setMembershipPending(null);
      }
    }
  }

  async function handleLeave() {
    if (!activity || membershipRequestRef.current) return;

    const activityId = activity.id;
    const requestToken = Symbol("leave-activity");
    membershipRequestRef.current = requestToken;
    setMembershipPending("leave");
    setMembershipError("");
    try {
      const result = await leaveActivity(activityId);
      if (
        membershipRequestRef.current !== requestToken ||
        currentActivityIdRef.current !== activityId
      ) {
        return;
      }
      setActivity((current) =>
        current?.id === activityId
          ? {
              ...current,
              membershipRole: null,
              memberCount: result.memberCount,
              maxParticipants: result.maxParticipants,
            }
          : current,
      );
    } catch (error) {
      if (
        membershipRequestRef.current !== requestToken ||
        currentActivityIdRef.current !== activityId
      ) {
        return;
      }
      if (error instanceof ActivityApiError) {
        if (error.code === "activity_started") {
          setMembershipError(t("create.detail.leaveStartedError"));
        } else if (error.status === 401) {
          setMembershipError(t("create.detail.sessionErrorMessage"));
        } else {
          setMembershipError(t("create.detail.leaveError"));
        }
      } else {
        setMembershipError(t("create.detail.leaveError"));
      }
    } finally {
      if (
        membershipRequestRef.current === requestToken &&
        currentActivityIdRef.current === activityId
      ) {
        membershipRequestRef.current = null;
        setMembershipPending(null);
      }
    }
  }

  async function handleCancelActivity() {
    if (!activity || organizerActionPending) return;

    const activityId = activity.id;

    setOrganizerActionPending(true);
    setOrganizerActionError("");

    try {
      const result = await cancelActivity(activityId);

      if (currentActivityIdRef.current !== activityId) {
        return;
      }

      setActivity((current) =>
        current?.id === activityId
          ? {
              ...current,
              status: result.activity.status,
            }
          : current,
      );

      setMembershipUnavailable(true);
      setCancelDialogOpen(false);
    } catch (error) {
      if (currentActivityIdRef.current !== activityId) {
        return;
      }

      if (error instanceof ActivityApiError) {
        if (error.code === "activity_finished") {
          setOrganizerActionError(t("create.detail.cancelFinishedError"));
        } else if (
          error.code === "activity_not_active" ||
          error.code === "activity_changed"
        ) {
          setOrganizerActionError(t("create.detail.cancelUnavailableError"));
        } else if (error.status === 401) {
          setOrganizerActionError(t("create.detail.sessionErrorMessage"));
        } else {
          setOrganizerActionError(t("create.detail.cancelError"));
        }
      } else {
        setOrganizerActionError(t("create.detail.cancelError"));
      }
    } finally {
      if (currentActivityIdRef.current === activityId) {
        setOrganizerActionPending(false);
      }
    }
  }

  if (loadState !== "ready" || !activity) {
    const title =
      loadState === "loading"
        ? t("create.detail.loading")
        : loadState === "not-found"
          ? t("create.detail.notFoundTitle")
          : loadState === "unauthorized"
            ? t("create.detail.sessionErrorTitle")
            : t("create.detail.loadErrorTitle");
    const message =
      loadState === "not-found"
        ? t("create.detail.notFoundMessage")
        : loadState === "unauthorized"
          ? t("create.detail.sessionErrorMessage")
          : loadState === "error"
            ? t("create.detail.loadErrorMessage")
            : "";

    return (
      <section className="mx-auto w-full max-w-3xl rounded-[26px] border border-border bg-card p-7 text-center soft-shadow sm:p-10">
        <CalendarDays className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-5 text-2xl font-bold">{title}</h1>
        {message && (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {loadState !== "loading" && (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-7 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            {t("create.detail.backHome")}
          </button>
        )}
      </section>
    );
  }

  const locale = i18n.language === "en" ? "en-GB" : "es-ES";
  const dateOptions: Intl.DateTimeFormatOptions = {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: activity.timezoneName,
  };
  let startsLabel: string;
  let endsLabel: string | null = null;
  try {
    startsLabel = new Intl.DateTimeFormat(locale, dateOptions).format(
      new Date(activity.startsAt),
    );
    if (activity.endsAt) {
      endsLabel = new Intl.DateTimeFormat(locale, {
        timeStyle: "short",
        timeZone: activity.timezoneName,
      }).format(new Date(activity.endsAt));
    }
  } catch {
    startsLabel = new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(activity.startsAt));
    if (activity.endsAt) {
      endsLabel = new Intl.DateTimeFormat(locale, {
        timeStyle: "short",
      }).format(new Date(activity.endsAt));
    }
  }

  const organizer =
    activity.organizer.displayName ||
    activity.organizer.username ||
    t("create.detail.unknownOrganizer");
  const location =
    activity.locationType === "physical"
      ? [activity.city, activity.meetingPoint].filter(Boolean).join(" · ")
      : activity.onlinePlatform || t("create.detail.onlineNoPlatform");
  const locationType = t(`locationTypes.${activity.locationType}`);
  const participants =
    activity.participationMode === "limited"
      ? t("create.detail.participantsLimited", {
          count: activity.memberCount,
          max: activity.maxParticipants,
        })
      : `${t("create.detail.participantsUnlimited", {
          count: activity.memberCount,
        })} · ${t("create.detail.unlimited")}`;
  const availableSpots =
    activity.participationMode === "limited" &&
    activity.maxParticipants !== null
      ? Math.max(activity.maxParticipants - activity.memberCount, 0)
      : null;
  const isFull = availableSpots === 0;
  const availability =
    availableSpots === null
      ? ""
      : availableSpots === 0
        ? t("create.detail.noSpots")
        : t("create.detail.spotsAvailable", {
            count: availableSpots,
          });
  const activityStartsAt = Date.parse(activity.startsAt);

  const activityFinishedAt = Date.parse(
    activity.endsAt ?? activity.startsAt,
  );

  const canOrganizerEdit =
    activity.membershipRole === 'organizer' &&
    activity.status === 'active' &&
    Number.isFinite(activityStartsAt) &&
    activityStartsAt > Date.now();

  const canOrganizerCancel =
    activity.membershipRole === 'organizer' &&
    activity.status === 'active' &&
    Number.isFinite(activityFinishedAt) &&
    activityFinishedAt > Date.now();

  const cost =
    activity.costType === "free"
      ? t("create.cost.free")
      : activity.costType === "each_own"
        ? t("create.cost.eachOwn")
        : `${activity.estimatedCost} ${activity.currency}`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("create.detail.back")}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary/10"
        >
          <Share2 className="h-4 w-4" />
          {t("create.detail.share")}
        </button>
      </div>

      {shareMessage && (
        <p
          className="text-right text-xs font-semibold text-primary"
          role="status"
        >
          {shareMessage}
        </p>
      )}

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!organizerActionPending) {
            setCancelDialogOpen(open);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('create.detail.cancelPlan')}
            </DialogTitle>

            <DialogDescription>
              {t('create.detail.cancelConfirm')}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setCancelDialogOpen(false)}
              disabled={organizerActionPending}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('create.back')}
            </button>

            <button
              type="button"
              onClick={handleCancelActivity}
              disabled={organizerActionPending}
              className="rounded-full bg-destructive px-5 py-2.5 text-sm font-bold text-destructive-foreground transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {organizerActionPending
                ? t('create.detail.cancellingPlan')
                : t('create.detail.cancelPlan')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <article className="overflow-hidden rounded-[28px] border border-border bg-card soft-shadow">
        <header className="border-b border-border bg-primary/[.04] p-6 sm:p-9">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {t(`categories.${activity.category}`)}
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              {t(`subcategories.${activity.subcategory}`)}
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-[-.055em] sm:text-5xl">
            {activity.title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("create.detail.organizer")}{" "}
            <span className="font-bold text-foreground">{organizer}</span>
          </p>
        </header>

        <section className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9">
          <div>
            {activity.membershipRole === "organizer" ? (
              <p className="text-sm font-bold text-primary">
                {t("create.detail.organizerStatus")}
              </p>
            ) : activity.membershipRole === null && isFull ? (
              <>
                <p className="text-sm font-bold">
                  {t("create.detail.planFull")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("create.detail.noSpots")}
                </p>
              </>
            ) : activity.membershipRole === null &&
              (activity.status !== "active" || membershipUnavailable) ? (
              <p className="text-sm font-semibold text-muted-foreground">
                {t("create.detail.joinInactiveError")}
              </p>
            ) : null}
            {membershipError && (
              <p
                className="mt-2 text-xs font-semibold text-destructive"
                role="alert"
              >
                {membershipError}
              </p>
            )}
            {organizerActionError && (
              <p
                className="mt-2 text-xs font-semibold text-destructive"
                role="alert"
              >
                {organizerActionError}
              </p>
            )}
          </div>

          {activity.membershipRole === 'organizer' && canOrganizerCancel ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {canOrganizerEdit && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/activities/${activity.id}/edit`, {
                      replace: true,
                    })
                  }
                  disabled={organizerActionPending}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 px-5 py-3 text-sm font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Edit3 className="h-4 w-4" />
                  {t('create.detail.editPlan')}
                </button>
              )}

              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                disabled={organizerActionPending}
                className="rounded-full border border-destructive/45 px-5 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {organizerActionPending
                  ? t('create.detail.cancellingPlan')
                  : t('create.detail.cancelPlan')}
              </button>
            </div>
          ) : activity.membershipRole === 'participant' ? (
            <button
              type="button"
              onClick={handleLeave}
              disabled={membershipPending !== null}
              className="rounded-full border border-destructive/45 px-5 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(
                membershipPending === "leave"
                  ? "create.detail.leaving"
                  : "create.detail.leavePlan",
              )}
            </button>
          ) : activity.membershipRole === null &&
            activity.status === "active" &&
            !membershipUnavailable &&
            !isFull ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={membershipPending !== null}
              className="outfy-primary-action rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(
                membershipPending === "join"
                  ? "create.detail.joining"
                  : "create.detail.joinPlan",
              )}
            </button>
          ) : null}
        </section>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-9">
          <DetailItem icon={CalendarDays} label={t("create.detail.date")}>
            {startsLabel}
            {endsLabel ? ` – ${endsLabel}` : ""}
          </DetailItem>
          <DetailItem icon={MapPin} label={t("create.detail.location")}>
            {locationType} · {location}
          </DetailItem>
          <DetailItem icon={Users} label={t("create.detail.participants")}>
            {participants}
            {availability && (
              <span className="block text-xs font-normal text-muted-foreground">
                {availability}
              </span>
            )}
          </DetailItem>
          <DetailItem icon={CircleDollarSign} label={t("create.detail.cost")}>
            {cost}
          </DetailItem>

          {activity.description && (
            <section className="mt-3 border-t border-border pt-6 sm:col-span-2">
              <h2 className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
                {t("create.detail.description")}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                {activity.description}
              </p>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background/45 p-4">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="h-4 w-4" />
        <h2 className="text-[10px] font-bold uppercase tracking-[.14em]">
          {label}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6">{children}</p>
    </section>
  );
}
