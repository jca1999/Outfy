import {
  ArrowLeft,
  CalendarDays,
  LockKeyhole,
  MapPin,
  Users,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useRoute } from "wouter";

import {
  AuthApiError,
  getPublicProfile,
  type PublicProfile,
} from "@/auth/auth-api";
import {
  getUserActivities,
  type ProfileActivity,
} from "@/activities/activity-api";
import { ConnectionAvatar } from "@/connections/connection-ui";
import { ProfileRelationship } from "@/connections/profile-relationship";

type LoadState = "loading" | "ready" | "notFound" | "error";

export function PublicProfile() {
  const { t, i18n } = useTranslation("profile");
  const { t: tActivities } = useTranslation("activities");
  const [, navigate] = useLocation();
  const [, params] = useRoute("/users/:username");

  const username = params?.username ?? "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const refreshSeq = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [plans, setPlans] = useState<ProfileActivity[]>([]);
  const [plansState, setPlansState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [plansReloadKey, setPlansReloadKey] = useState(0);

  // Silent refresh after relationship changes: privacy representation may change.
  const refreshProfile = useCallback(() => {
    if (!username) return;
    // A removed connection must immediately stop rendering friends-only data
    // while the server computes the new safe representation.
    setProfile((current) => current ? {
      ...current, displayName: null, city: null, country: null,
    } : current);
    const seq = ++refreshSeq.current;
    getPublicProfile(username)
      .then((result) => {
        if (seq !== refreshSeq.current) return;
        if (result.profile.username.toLowerCase() !== username.toLowerCase()) return;
        setProfile(result.profile);
      })
      .catch(() => {
        if (seq !== refreshSeq.current) return;
        // Never keep a possibly outdated (e.g. friends-only) representation.
        setProfile(null);
        setLoadState("error");
      });
  }, [username]);

  useEffect(() => {
    let active = true;

    if (!username) {
      setLoadState("notFound");
      return;
    }

    refreshSeq.current++;
    setProfile(null);
    setLoadState("loading");

    getPublicProfile(username)
      .then((result) => {
        if (!active) return;

        if (result.profile.isOwnProfile) {
          navigate("/profile", { replace: true });
          return;
        }

        setProfile(result.profile);
        setLoadState("ready");
      })
      .catch((error) => {
        if (!active) return;

        if (error instanceof AuthApiError && error.status === 404) {
          setLoadState("notFound");
          return;
        }

        setLoadState("error");
      });

    return () => {
      active = false;
      refreshSeq.current++;
    };
  }, [navigate, username, reloadKey]);

  useEffect(() => {
    if (!profile) {
      setPlans([]);
      setPlansState("idle");
      return;
    }

    if (profile.isPrivate) {
      setPlans([]);
      setPlansState("ready");
      return;
    }

    let active = true;

    setPlansState("loading");

    getUserActivities(profile.id)
      .then((result) => {
        if (!active) return;

        setPlans(result.activities);
        setPlansState("ready");
      })
      .catch(() => {
        if (!active) return;

        setPlans([]);
        setPlansState("error");
      });

    return () => {
      active = false;
    };
  }, [profile?.id, profile?.isPrivate, plansReloadKey]);

  const handleRelationshipChanged = useCallback(() => {
    refreshProfile();
    setPlansReloadKey((current) => current + 1);
  }, [refreshProfile]);
  
  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    navigate("/");
  }

  if (loadState === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-20 rounded-full bg-muted" />

          <div className="rounded-[26px] border border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="h-24 w-24 rounded-full bg-muted" />
              <div className="h-7 w-40 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "notFound") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("publicProfile.back")}
        </button>

        <div className="rounded-[26px] border border-dashed border-border bg-card p-8 text-center">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />

          <h1 className="mt-4 text-xl font-bold">
            {t("publicProfile.notFoundTitle")}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {t("publicProfile.notFoundDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (loadState === "error" || !profile) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("publicProfile.back")}
        </button>

        <div className="rounded-[26px] border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-bold">
            {t("publicProfile.errorTitle")}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {t("publicProfile.errorDescription")}
          </p>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground outfy-primary-action"
            data-testid="button-retry-profile"
          >
            {t("common:connections.retry")}
          </button>
        </div>
      </div>
    );
  }

  const visibleName =
    profile.displayName?.trim() || `@${profile.username}`;

  const location =
    profile.city && profile.country
      ? `${profile.city}, ${profile.country}`
      : profile.city || profile.country;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("publicProfile.back")}
      </button>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <div className="flex flex-col items-center text-center">
          <ConnectionAvatar profile={profile} className="h-24 w-24 text-2xl" />

          <h1 className="mt-5 text-3xl font-bold tracking-[-.05em]">
            {visibleName}
          </h1>

          {profile.displayName && (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              @{profile.username}
            </p>
          )}

          {!profile.isPrivate && location && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{location}</span>
            </div>
          )}

          {profile.isPrivate && (
            <div className="mt-6 w-full rounded-[20px] border border-border bg-muted/30 p-5">
              <LockKeyhole className="mx-auto h-6 w-6 text-muted-foreground" />

              <h2 className="mt-3 text-sm font-bold">
                {t("publicProfile.privateTitle")}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {t("publicProfile.privateDescription")}
              </p>
            </div>
          )}

          <ProfileRelationship
            key={profile.id}
            userId={profile.id}
            name={visibleName}
            onChanged={handleRelationshipChanged}
          />
        </div>
      </section>
      {!profile.isPrivate && (
        <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t("publicProfile.plans.title")}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {t("publicProfile.plans.description")}
              </p>
            </div>
          </div>

          {plansState === "loading" ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[170px] animate-pulse rounded-[22px] bg-muted"
                />
              ))}
            </div>
          ) : plansState === "error" ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-border p-6 text-center">
              <p className="text-sm font-semibold">
                {t("publicProfile.plans.error")}
              </p>

              <button
                type="button"
                onClick={() =>
                  setPlansReloadKey((current) => current + 1)
                }
                className="mt-4 rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background"
              >
                {t("publicProfile.plans.retry")}
              </button>
            </div>
          ) : plans.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-border p-7 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />

              <h3 className="mt-3 text-sm font-bold">
                {t("publicProfile.plans.emptyTitle")}
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {t("publicProfile.plans.emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {plans.map((activity) => {
                const date = new Date(activity.startsAt);

                let dateLabel: string;

                try {
                  dateLabel = new Intl.DateTimeFormat(
                    i18n.language === "en" ? "en-GB" : "es-ES",
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: activity.timezoneName,
                    },
                  ).format(date);
                } catch {
                  dateLabel = new Intl.DateTimeFormat(
                    i18n.language === "en" ? "en-GB" : "es-ES",
                    {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  ).format(date);
                }

                const locationLabel =
                  activity.locationType === "online"
                    ? tActivities("locationTypes.online")
                    : activity.city ?? "";

                return (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() =>
                      navigate(`/activities/${activity.id}`)
                    }
                    className="group flex w-full flex-col rounded-[22px] border border-border bg-background p-4 text-left transition hover:border-foreground/20 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                        {tActivities(
                          `categories.${activity.category}`,
                        )}
                      </span>

                      {activity.visibility === "friends" && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                          {t("publicProfile.plans.friendsOnly")}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-tight group-hover:underline">
                      {activity.title}
                    </h3>

                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 shrink-0 text-foreground/40" />
                        <span>{dateLabel}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-foreground/40" />
                        <span className="truncate">
                          {locationLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 shrink-0 text-foreground/40" />

                        <span>
                          {activity.participationMode === "limited"
                            ? tActivities(
                                "create.detail.participantsLimited",
                                {
                                  count: activity.memberCount,
                                  max: activity.maxParticipants,
                                },
                              )
                            : tActivities(
                                "create.detail.participantsUnlimited",
                                {
                                  count: activity.memberCount,
                                },
                              )}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}