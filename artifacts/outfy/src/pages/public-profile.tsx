import {
  ArrowLeft,
  CalendarDays,
  LockKeyhole,
  MapPin,
  Star,
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
  type ProfileReputation,
} from "@/activities/activity-api";
import { ConnectionAvatar } from "@/connections/connection-ui";
import { ProfileRelationship } from "@/connections/profile-relationship";
import { ProfileInterestsCard } from "@/components/profile-interests-card";
import {
  getConnectionSocialOverview,
  type ConnectionSocialOverview,
} from "@/connections/connections-api";
import { ProfileReputationCard } from "@/components/profile-reputation-card";

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
  const [completedPlans, setCompletedPlans] = useState<ProfileActivity[]>([]);
  const [profilePlansTab, setProfilePlansTab] = useState<
    "upcoming" | "completed"
  >("upcoming");
  const [reputation, setReputation] = useState<ProfileReputation | null>(null);
  const [plansState, setPlansState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [plansReloadKey, setPlansReloadKey] = useState(0);

  const [socialOverview, setSocialOverview] =
    useState<ConnectionSocialOverview | null>(null);

  const [socialState, setSocialState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const [socialReloadKey, setSocialReloadKey] = useState(0);

  // Silent refresh after relationship changes: privacy representation may change.
  const refreshProfile = useCallback(() => {
    if (!username) return;
    // A removed connection must immediately stop rendering friends-only data
    // while the server computes the new safe representation.
    setProfile((current) =>
      current
        ? {
            ...current,
            displayName: null,
            city: null,
            country: null,
          }
        : current,
    );
    const seq = ++refreshSeq.current;
    getPublicProfile(username)
      .then((result) => {
        if (seq !== refreshSeq.current) return;
        if (result.profile.username.toLowerCase() !== username.toLowerCase())
          return;
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
      setCompletedPlans([]);
      setReputation(null);
      setPlansState("idle");
      return;
    }

    if (profile.isPrivate) {
      setPlans([]);
      setCompletedPlans([]);
      setReputation(null);
      setPlansState("ready");
      return;
    }

    let active = true;

    setPlansState("loading");

    getUserActivities(profile.id)
      .then((result) => {
        if (!active) return;

        setPlans(result.activities);
        setCompletedPlans(result.completedActivities);
        setReputation(result.reputation);
        setPlansState("ready");
      })
      .catch(() => {
        if (!active) return;

        setPlans([]);
        setCompletedPlans([]);
        setReputation(null);
        setPlansState("error");
      });

    return () => {
      active = false;
    };
  }, [profile?.id, profile?.isPrivate, plansReloadKey]);

  useEffect(() => {
    if (!profile) {
      setSocialOverview(null);
      setSocialState("idle");
      return;
    }

    let active = true;

    setSocialOverview(null);
    setSocialState("loading");

    getConnectionSocialOverview(profile.id)
      .then((result) => {
        if (!active) return;

        setSocialOverview(result);
        setSocialState("ready");
      })
      .catch(() => {
        if (!active) return;

        setSocialOverview(null);
        setSocialState("error");
      });

    return () => {
      active = false;
    };
  }, [profile?.id, socialReloadKey]);

  const handleRelationshipChanged = useCallback(() => {
    refreshProfile();

    setPlansReloadKey((current) => current + 1);
    setSocialReloadKey((current) => current + 1);
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
          <h1 className="text-xl font-bold">{t("publicProfile.errorTitle")}</h1>

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

  const visibleName = profile.displayName?.trim() || `@${profile.username}`;

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
          <ConnectionAvatar
            profile={profile}
            className="h-28 w-28 text-3xl ring-4 ring-primary/10"
          />

          <h1 className="mt-5 text-3xl font-bold tracking-[-.05em]">
            {visibleName}
          </h1>

          {profile.displayName && (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              @{profile.username}
            </p>
          )}

          {!profile.isPrivate && location && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span>{location}</span>
            </div>
          )}

          {!profile.isPrivate && reputation && (
            <div className="mt-6 grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[18px] border border-border bg-background px-2 py-4 text-center">
                <p className="text-xl font-bold tracking-[-.04em]">
                  {reputation.completedActivityCount}
                </p>

                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  {t("socialStats.completed")}
                </p>
              </div>

              <div className="rounded-[18px] border border-border bg-background px-2 py-4 text-center">
                <p className="flex items-center justify-center gap-1 text-xl font-bold tracking-[-.04em]">
                  <Star className="h-4 w-4 fill-current text-primary" />

                  {reputation.averageRating !== null
                    ? reputation.averageRating.toFixed(1)
                    : "—"}
                </p>

                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  {t("socialStats.rating")}
                </p>
              </div>

              <div className="rounded-[18px] border border-border bg-background px-2 py-4 text-center">
                <p className="text-xl font-bold tracking-[-.04em]">
                  {reputation.reviewCount}
                </p>

                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  {t("socialStats.reviews")}
                </p>
              </div>

              <div className="rounded-[18px] border border-border bg-background px-2 py-4 text-center">
                <p className="text-xl font-bold tracking-[-.04em]">
                  {socialState === "ready"
                    ? (socialOverview?.friendCount ?? "—")
                    : "—"}
                </p>

                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  {t("socialStats.friends")}
                </p>
              </div>
            </div>
          )}

          {!profile.isPrivate &&
            socialState === "ready" &&
            socialOverview &&
            socialOverview.mutualCount > 0 && (
              <div className="mt-5 w-full max-w-2xl rounded-[20px] border border-border bg-background p-4">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {socialOverview.mutualFriends.map((friend) => (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() =>
                            navigate(
                              `/users/${encodeURIComponent(friend.username)}`,
                            )
                          }
                          title={`@${friend.username}`}
                          className="rounded-full ring-2 ring-background transition hover:z-10 hover:-translate-y-0.5"
                        >
                          <ConnectionAvatar
                            profile={friend}
                            className="h-9 w-9 text-xs"
                          />
                        </button>
                      ))}
                    </div>

                    <div className="text-left">
                      <p className="text-sm font-bold">
                        {t("publicProfile.mutualFriends", {
                          count: socialOverview.mutualCount,
                        })}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {t("publicProfile.mutualFriendsDescription")}
                      </p>
                    </div>
                  </div>
                </div>
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

          <div className="mt-6 w-full">
            <ProfileRelationship
              key={profile.id}
              userId={profile.id}
              name={visibleName}
              onChanged={handleRelationshipChanged}
            />
          </div>
        </div>
      </section>

      {!profile.isPrivate && profile.bio && (
        <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
          <h2 className="text-xl font-bold tracking-[-.03em]">
            {t("identity.bio.label")}
          </h2>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {profile.bio}
          </p>
        </section>
      )}

      {!profile.isPrivate && profile.interests.length > 0 && (
        <ProfileInterestsCard interests={profile.interests} />
      )}

      {!profile.isPrivate && reputation && (
        <ProfileReputationCard reputation={reputation} />
      )}

      {!profile.isPrivate &&
        reputation &&
        reputation.recentReviews.length > 0 && (
          <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
            <div>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t("publicProfile.reputation.publicOpinionsTitle")}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {t("publicProfile.reputation.opinionsDescription")}
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {reputation.recentReviews.map((review) => (
                <div
                  key={`${review.activityId}-${review.reviewerId}`}
                  className="rounded-[20px] border border-border bg-background p-4"
                >
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        className={`h-4 w-4 ${
                          index < review.rating
                            ? "fill-current text-primary"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    “{review.comment}”
                  </p>

                  <div className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/activities/${review.activityId}`)
                      }
                      className="text-left font-semibold text-primary transition hover:underline"
                    >
                      {t("publicProfile.reputation.opinionPlan", {
                        title: review.activityTitle,
                      })}
                    </button>

                    <span>
                      {review.reviewerUsername
                        ? t("publicProfile.reputation.opinionBy", {
                            username: review.reviewerUsername,
                          })
                        : t("publicProfile.reputation.opinionByFallback")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      {!profile.isPrivate && (
        <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-.03em]">
                {t("publicProfile.plans.title")}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {profilePlansTab === "upcoming"
                  ? t("publicProfile.plans.description")
                  : t("publicProfile.plans.completedDescription")}
              </p>
            </div>

            <div
              className="flex rounded-full bg-muted p-1"
              role="tablist"
              aria-label={t("publicProfile.plans.title")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={profilePlansTab === "upcoming"}
                onClick={() => setProfilePlansTab("upcoming")}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  profilePlansTab === "upcoming"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("publicProfile.plans.upcomingTab")}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={profilePlansTab === "completed"}
                onClick={() => setProfilePlansTab("completed")}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  profilePlansTab === "completed"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("publicProfile.plans.completedTab")}
              </button>
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
          ) : profilePlansTab === "upcoming" ? (
            plans.length === 0 ? (
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
                      : (activity.city ?? "");

                  return (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() =>
                        navigate(`/activities/${activity.id}`)
                      }
                      className="group flex w-full flex-col rounded-[22px] border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
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
            )
          ) : completedPlans.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-border p-7 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />

              <h3 className="mt-3 text-sm font-bold">
                {t("publicProfile.plans.completedEmptyTitle")}
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {t("publicProfile.plans.completedEmptyDescription")}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {completedPlans.map((activity) => {
                const date = new Date(activity.startsAt);

                let dateLabel: string;

                try {
                  dateLabel = new Intl.DateTimeFormat(
                    i18n.language === "en" ? "en-GB" : "es-ES",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: activity.timezoneName,
                    },
                  ).format(date);
                } catch {
                  dateLabel = new Intl.DateTimeFormat(
                    i18n.language === "en" ? "en-GB" : "es-ES",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  ).format(date);
                }

                const locationLabel =
                  activity.locationType === "online"
                    ? tActivities("locationTypes.online")
                    : (activity.city ?? "");

                return (
                  <div
                    key={activity.id}
                    className="flex w-full flex-col rounded-[22px] border border-border bg-muted/20 p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                        {tActivities(
                          `categories.${activity.category}`,
                        )}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                        {t("publicProfile.plans.completedBadge")}
                      </span>
                    </div>

                    <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-tight">
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
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
