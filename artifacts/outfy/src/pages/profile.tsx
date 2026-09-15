import {
  ArrowRight,
  CalendarDays,
  Camera,
  Edit3,
  Loader2,
  MapPin,
  RefreshCw,
  Settings as SettingsIcon,
  Star,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import {
  getMyActivityHistory,
  getMyCreatedActivities,
  getMyJoinedActivities,
  saveActivityReview,
  type MyCreatedActivity,
  type MyHistoryActivity,
  type MyJoinedActivity,
} from "@/activities/activity-api";
import {
  deleteProfileAvatar,
  getProfileAvatar,
  uploadProfileAvatar,
} from "@/auth/auth-api";
import { useAuth } from "@/auth/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SOURCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_OUTPUT_MAX_BYTES = 1048576;
const SUPPORTED_SOURCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function loadLocalImage(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

async function createAvatarBlob(source: string, crop: Area) {
  const image = await loadLocalImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  for (const quality of [0.82, 0.75, 0.68]) {
    const blob = await canvasToWebp(canvas, quality);
    if (
      blob?.type === "image/webp" &&
      blob.size > 0 &&
      blob.size <= AVATAR_OUTPUT_MAX_BYTES
    ) {
      return blob;
    }
  }

  throw new Error("Unable to create a valid avatar.");
}

export function Profile() {
  const { t, i18n } = useTranslation(["profile", "activities"]);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"created" | "upcoming" | "history">("created");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarVersionRef = useRef(0);
  const localAvatarUrlRef = useRef<string | null>(null);
  const avatarBusyRef = useRef(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarOperation, setAvatarOperation] = useState<
    "idle" | "preparing" | "uploading" | "deleting"
  >("idle");

  const [createdActivities, setCreatedActivities] = useState<
    MyCreatedActivity[]
  >([]);
  const [createdState, setCreatedState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const [joinedActivities, setJoinedActivities] = useState<MyJoinedActivity[]>(
    [],
  );
  const [joinedState, setJoinedState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const [historyActivities, setHistoryActivities] = useState<
    MyHistoryActivity[]
  >([]);

  const [historyState, setHistoryState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  
  const [reviewActivity, setReviewActivity] =
    useState<MyHistoryActivity | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  function loadCreatedActivities() {
    setCreatedState("loading");
    getMyCreatedActivities()
      .then((result) => {
        setCreatedActivities(result.activities);
        setCreatedState("ready");
      })
      .catch(() => {
        setCreatedState("error");
      });
  }

  function loadJoinedActivities() {
    setJoinedState("loading");
    getMyJoinedActivities()
      .then((result) => {
        setJoinedActivities(result.activities);
        setJoinedState("ready");
      })
      .catch(() => {
        setJoinedState("error");
      });
  }

  function loadHistoryActivities() {
    setHistoryState("loading");
    getMyActivityHistory()
      .then((result) => {
        setHistoryActivities(result.activities);
        setHistoryState("ready");
      })
      .catch(() => {
        setHistoryState("error");
      });
  }

  function openReview(activity: MyHistoryActivity) {
    setReviewActivity(activity);
    setReviewRating(activity.myReview?.rating ?? 0);
    setReviewComment(activity.myReview?.comment ?? "");
    setReviewError(null);
  }

  function closeReview() {
    if (reviewSaving) return;

    setReviewActivity(null);
    setReviewRating(0);
    setReviewComment("");
    setReviewError(null);
  }

  async function handleSaveReview() {
    if (
      !reviewActivity ||
      reviewSaving ||
      reviewRating < 1 ||
      reviewRating > 5
    ) {
      return;
    }

    setReviewSaving(true);
    setReviewError(null);

    try {
      const result = await saveActivityReview(reviewActivity.id, {
        rating: reviewRating,
        comment: reviewComment,
      });

      setHistoryActivities((current) =>
        current.map((activity) =>
          activity.id === reviewActivity.id
            ? {
                ...activity,
                myReview: {
                  rating: result.review.rating,
                  comment: result.review.comment,
                },
                averageRating: result.averageRating,
                reviewCount: result.reviewCount,
              }
            : activity,
        ),
      );

      setReviewActivity(null);
      setReviewRating(0);
      setReviewComment("");
    } catch {
      setReviewError(t("activities:myPlans.review.saveError"));
    } finally {
      setReviewSaving(false);
    }
  }

  useEffect(() => {
    let active = true;
    setCreatedState("loading");

    getMyCreatedActivities()
      .then((result) => {
        if (!active) return;
        setCreatedActivities(result.activities);
        setCreatedState("ready");
      })
      .catch(() => {
        if (!active) return;
        setCreatedState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== "upcoming") return;

    let active = true;
    setJoinedState("loading");

    getMyJoinedActivities()
      .then((result) => {
        if (!active) return;
        setJoinedActivities(result.activities);
        setJoinedState("ready");
      })
      .catch(() => {
        if (!active) return;
        setJoinedState("error");
      });

    return () => {
      active = false;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "history") return;

    let active = true;
    setHistoryState("loading");

    getMyActivityHistory()
      .then((result) => {
        if (!active) return;
        setHistoryActivities(result.activities);
        setHistoryState("ready");
      })
      .catch(() => {
        if (!active) return;
        setHistoryState("error");
      });

    return () => {
      active = false;
    };
  }, [tab]);

  useEffect(() => {
    let active = true;
    const requestVersion = avatarVersionRef.current;

    getProfileAvatar()
      .then((result) => {
        if (active && avatarVersionRef.current === requestVersion) {
          setAvatarUrl(result.avatarUrl);
        }
      })
      .catch(() => {
        if (active && avatarVersionRef.current === requestVersion) {
          setAvatarError(t("avatar.loadError"));
        }
      });

    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    return () => {
      if (cropSource) URL.revokeObjectURL(cropSource);
    };
  }, [cropSource]);

  useEffect(() => {
    return () => {
      if (localAvatarUrlRef.current) {
        URL.revokeObjectURL(localAvatarUrlRef.current);
      }
    };
  }, []);

  const closeCropEditor = useCallback(() => {
    setCropSource(null);
    setCroppedArea(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedArea(croppedAreaPixels);
    },
    [],
  );

  function handleFileSelection(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;

    if (!SUPPORTED_SOURCE_TYPES.has(file.type)) {
      setAvatarError(t("avatar.invalidFormat"));
      return;
    }

    if (file.size > SOURCE_IMAGE_MAX_BYTES) {
      setAvatarError(t("avatar.sourceTooLarge"));
      return;
    }

    setCropSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
  }

  async function saveAvatar() {
    if (
      !cropSource ||
      !croppedArea ||
      avatarOperation !== "idle" ||
      avatarBusyRef.current
    ) {
      return;
    }

    let uploadStarted = false;
    avatarBusyRef.current = true;
    setAvatarError(null);
    setAvatarOperation("preparing");
    try {
      const avatar = await createAvatarBlob(cropSource, croppedArea);
      uploadStarted = true;
      avatarVersionRef.current += 1;
      setAvatarOperation("uploading");
      const result = await uploadProfileAvatar(avatar);
      if (localAvatarUrlRef.current) {
        URL.revokeObjectURL(localAvatarUrlRef.current);
        localAvatarUrlRef.current = null;
      }
      if (result.avatarUrl) {
        setAvatarUrl(result.avatarUrl);
      } else {
        const localAvatarUrl = URL.createObjectURL(avatar);
        localAvatarUrlRef.current = localAvatarUrl;
        setAvatarUrl(localAvatarUrl);
      }
      closeCropEditor();
    } catch {
      if (uploadStarted) {
        try {
          const currentAvatar = await getProfileAvatar();
          if (localAvatarUrlRef.current) {
            URL.revokeObjectURL(localAvatarUrlRef.current);
            localAvatarUrlRef.current = null;
          }
          setAvatarUrl(currentAvatar.avatarUrl);
        } catch {
          // Preserve the current UI if server-state reconciliation also fails.
        }
      }
      setAvatarError(
        uploadStarted ? t("avatar.uploadError") : t("avatar.processingError"),
      );
    } finally {
      avatarBusyRef.current = false;
      setAvatarOperation("idle");
    }
  }

  async function removeAvatar() {
    if (
      avatarOperation !== "idle" ||
      avatarBusyRef.current ||
      !window.confirm(t("avatar.removeConfirm"))
    ) {
      return;
    }

    avatarBusyRef.current = true;
    avatarVersionRef.current += 1;
    setAvatarError(null);
    setAvatarOperation("deleting");
    try {
      await deleteProfileAvatar();
      if (localAvatarUrlRef.current) {
        URL.revokeObjectURL(localAvatarUrlRef.current);
        localAvatarUrlRef.current = null;
      }
      setAvatarUrl(null);
    } catch {
      try {
        const currentAvatar = await getProfileAvatar();
        if (localAvatarUrlRef.current) {
          URL.revokeObjectURL(localAvatarUrlRef.current);
          localAvatarUrlRef.current = null;
        }
        setAvatarUrl(currentAvatar.avatarUrl);
      } catch {
        // Preserve the current UI if server-state reconciliation also fails.
      }
      setAvatarError(t("avatar.deleteError"));
    } finally {
      avatarBusyRef.current = false;
      setAvatarOperation("idle");
    }
  }

  const visibleName = user?.displayName?.trim() || user?.username || "";

  const initials = visibleName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const renderActivityCard = (
    activity: MyCreatedActivity | MyJoinedActivity | MyHistoryActivity,
    historical = false,
  ) => {
    const locale = i18n.language === "en" ? "en-GB" : "es-ES";
    let dateLabel: string;
    try {
      dateLabel = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: activity.timezoneName,
      }).format(new Date(activity.startsAt));
    } catch {
      dateLabel = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(activity.startsAt));
    }

    const location =
      activity.locationType === "online"
        ? t("activities:locationTypes.online")
        : activity.city || t("activities:locationTypes.physical");
    const participants =
      activity.participationMode === "limited"
        ? t("activities:create.detail.participantsLimited", {
            count: activity.memberCount,
            max: activity.maxParticipants,
          })
        : `${t("activities:create.detail.participantsUnlimited", {
            count: activity.memberCount,
          })} · ${t("activities:create.detail.unlimited")}`;

    return (
      <button
        key={activity.id}
        type="button"
        onClick={() => navigate(`/activities/${activity.id}`)}
        className={`group flex min-h-44 w-full flex-col rounded-[22px] border border-border p-5 text-left soft-shadow transition hover:-translate-y-0.5 hover:border-primary/40 ${
          historical ? "bg-muted/30" : "bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            {t(`activities:myPlans.status.${activity.status}`)}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-tight tracking-[-.03em]">
          {activity.title}
        </h3>
        <p className="mt-1 text-xs font-semibold text-primary">
          {t(`activities:categories.${activity.category}`)}
        </p>

        <div className="mt-auto grid gap-1.5 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {dateLabel}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {location}
          </span>
          <span className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            {participants}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
            {t("header.eyebrow")}
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
            {t("header.title")}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/profile/edit")}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted"
          >
            <Edit3 className="h-3.5 w-3.5" />
            {t("header.edit")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label={t("header.settingsAriaLabel")}
            title={t("header.settingsAriaLabel")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={t("avatar.alt")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials || <UserRound className="h-8 w-8" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarOperation !== "idle"}
                aria-label={
                  avatarUrl ? t("avatar.changePhoto") : t("avatar.addPhoto")
                }
                title={
                  avatarUrl ? t("avatar.changePhoto") : t("avatar.addPhoto")
                }
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  handleFileSelection(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarOperation !== "idle"}
              className="text-xs font-bold text-primary transition hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {avatarUrl ? t("avatar.changePhoto") : t("avatar.addPhoto")}
            </button>

            {avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarOperation !== "idle"}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-destructive transition hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {avatarOperation === "deleting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {avatarOperation === "deleting"
                  ? t("avatar.removing")
                  : t("avatar.removePhoto")}
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-[-.04em]">
              {visibleName}
            </h2>

            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">
                {t("identity.username")}
              </p>

              <p className="mt-1 text-sm text-foreground">@{user?.username}</p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">
                {t("identity.location.label")}
              </p>

              <p className="mt-1 text-sm text-foreground">
                {(user?.homeLocation
                  ? `${user.homeLocation.city}, ${user.homeLocation.country}`
                  : user?.homeCity?.trim()) || t("identity.location.notSet")}
              </p>
            </div>
          </div>
        </div>

        {avatarError && (
          <p
            className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {avatarError}
          </p>
        )}
      </section>

      <section aria-labelledby="my-plans-title" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="my-plans-title"
            className="text-2xl font-bold tracking-[-.04em]"
          >
            {t("activities:myPlans.title")}
          </h2>

          <div
            className="flex w-full rounded-full bg-muted p-1 sm:w-auto"
            role="tablist"
            aria-label={t("activities:myPlans.title")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "created"}
              aria-controls="created-plans-panel"
              onClick={() => setTab("created")}
              className={`flex-1 rounded-full px-2 py-2 text-xs font-bold transition sm:flex-none sm:px-4 ${
                tab === "created"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("activities:myPlans.created")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "upcoming"}
              aria-controls="upcoming-plans-panel"
              onClick={() => setTab("upcoming")}
              className={`flex-1 rounded-full px-2 py-2 text-xs font-bold transition sm:flex-none sm:px-4 ${
                tab === "upcoming"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("activities:myPlans.upcoming")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              aria-controls="history-plans-panel"
              onClick={() => setTab("history")}
              className={`flex-1 rounded-full px-2 py-2 text-xs font-bold transition sm:flex-none sm:px-4 ${
                tab === "history"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("activities:myPlans.history")}
            </button>
          </div>
        </div>

        {tab === "created" && (
          <div id="created-plans-panel" className="space-y-4" role="tabpanel">
            {createdState === "loading" && (
              <div
                className="grid gap-3 sm:grid-cols-2"
                aria-label={t("activities:myPlans.loading")}
              >
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="h-44 animate-pulse rounded-[22px] border border-border bg-card"
                  />
                ))}
              </div>
            )}

            {createdState === "error" && (
              <div className="rounded-[22px] border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {t("activities:myPlans.loadError")}
                </p>
                <button
                  type="button"
                  onClick={loadCreatedActivities}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("activities:myPlans.retry")}
                </button>
              </div>
            )}

            {createdState === "ready" && createdActivities.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-border bg-card p-7 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-4 text-base font-bold">
                  {t("activities:myPlans.emptyTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("activities:myPlans.emptyDescription")}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/activities/new")}
                  className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground"
                >
                  {t("activities:myPlans.createPlan")}
                </button>
              </div>
            )}

            {createdState === "ready" && createdActivities.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {createdActivities.map((activity) =>
                  renderActivityCard(activity),
                )}
              </div>
            )}
          </div>
        )}

        {tab === "upcoming" && (
          <div id="upcoming-plans-panel" className="space-y-4" role="tabpanel">
            {(joinedState === "loading" || joinedState === "idle") && (
              <div
                className="grid gap-3 sm:grid-cols-2"
                aria-label={t("activities:myPlans.upcomingLoading")}
              >
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="h-44 animate-pulse rounded-[22px] border border-border bg-card"
                  />
                ))}
              </div>
            )}

            {joinedState === "error" && (
              <div className="rounded-[22px] border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {t("activities:myPlans.upcomingLoadError")}
                </p>
                <button
                  type="button"
                  onClick={loadJoinedActivities}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("activities:myPlans.retry")}
                </button>
              </div>
            )}

            {joinedState === "ready" && joinedActivities.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-border bg-card p-7 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-4 text-base font-bold">
                  {t("activities:myPlans.upcomingEmptyTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("activities:myPlans.upcomingEmptyDescription")}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/explore")}
                  className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground"
                >
                  {t("activities:myPlans.explorePlans")}
                </button>
              </div>
            )}

            {joinedState === "ready" && joinedActivities.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {joinedActivities.map((activity) =>
                  renderActivityCard(activity),
                )}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div id="history-plans-panel" className="space-y-4" role="tabpanel">
            {(historyState === "loading" || historyState === "idle") && (
              <div
                className="grid gap-3 sm:grid-cols-2"
                aria-label={t("activities:myPlans.historyLoading")}
              >
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="h-44 animate-pulse rounded-[22px] border border-border bg-card"
                  />
                ))}
              </div>
            )}

            {historyState === "error" && (
              <div className="rounded-[22px] border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {t("activities:myPlans.historyLoadError")}
                </p>
                <button
                  type="button"
                  onClick={loadHistoryActivities}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("activities:myPlans.retry")}
                </button>
              </div>
            )}

            {historyState === "ready" && historyActivities.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-border bg-card p-7 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-4 text-base font-bold">
                  {t("activities:myPlans.historyEmptyTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("activities:myPlans.historyEmptyDescription")}
                </p>
              </div>
            )}

            {historyState === "ready" && historyActivities.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {historyActivities.map((activity) => (
                  <div key={activity.id} className="space-y-2">
                    {renderActivityCard(activity, true)}

                    <div className="rounded-[18px] border border-border bg-card px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          {activity.averageRating !== null ? (
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 fill-primary text-primary" />
                              <span className="text-sm font-bold">
                                {activity.averageRating.toFixed(1)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t("activities:myPlans.review.reviewCount", {
                                  count: activity.reviewCount,
                                })}
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t("activities:myPlans.review.noReviews")}
                            </p>
                          )}

                          {activity.myReview && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("activities:myPlans.review.yourRating", {
                                rating: activity.myReview.rating,
                              })}
                            </p>
                          )}
                        </div>

                        {activity.canReview && (
                          <button
                            type="button"
                            onClick={() => openReview(activity)}
                            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
                          >
                            {activity.myReview
                              ? t("activities:myPlans.review.edit")
                              : t("activities:myPlans.review.action")}
                          </button>
                        )}

                        {activity.relationship === "organizer" && (
                          <span className="text-xs text-muted-foreground">
                            {t("activities:myPlans.review.organizer")}
                          </span>
                        )}

                        {activity.relationship === "participant" &&
                          activity.status === "cancelled" && (
                            <span className="text-xs text-muted-foreground">
                              {t("activities:myPlans.review.cancelled")}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(reviewActivity)}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewActivity?.myReview
                ? t("activities:myPlans.review.editTitle")
                : t("activities:myPlans.review.title")}
            </DialogTitle>

            <DialogDescription>
              {reviewActivity
                ? t("activities:myPlans.review.description", {
                    title: reviewActivity.title,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-bold">
                {t("activities:myPlans.review.ratingLabel")}
              </p>

              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setReviewRating(rating)}
                    disabled={reviewSaving}
                    aria-label={t("activities:myPlans.review.starAriaLabel", {
                      rating,
                    })}
                    className="rounded-lg p-1.5 transition hover:bg-muted disabled:cursor-not-allowed"
                  >
                    <Star
                      className={`h-8 w-8 transition ${
                        rating <= reviewRating
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="activity-review-comment"
                className="text-sm font-bold"
              >
                {t("activities:myPlans.review.commentLabel")}
              </label>

              <textarea
                id="activity-review-comment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                disabled={reviewSaving}
                maxLength={1000}
                rows={4}
                placeholder={t("activities:myPlans.review.commentPlaceholder")}
                className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              />

              <p className="mt-1 text-right font-mono-ui text-[10px] text-muted-foreground">
                {reviewComment.length}/1000
              </p>
            </div>

            {reviewError && (
              <p
                className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {reviewError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReview}
                disabled={reviewSaving}
                className="rounded-full border border-border px-5 py-2.5 text-sm font-bold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("activities:myPlans.review.cancel")}
              </button>

              <button
                type="button"
                onClick={handleSaveReview}
                disabled={reviewSaving || reviewRating < 1 || reviewRating > 5}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewSaving && <Loader2 className="h-4 w-4 animate-spin" />}

                {reviewSaving
                  ? t("activities:myPlans.review.saving")
                  : t("activities:myPlans.review.save")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cropSource)}
        onOpenChange={(open) => {
          if (!open && avatarOperation === "idle") closeCropEditor();
        }}
      >
        <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("avatar.cropTitle")}</DialogTitle>
            <DialogDescription>{t("avatar.cropDescription")}</DialogDescription>
          </DialogHeader>

          <div className="relative h-[min(54vh,420px)] min-h-64 w-full overflow-hidden rounded-2xl bg-muted">
            {cropSource && (
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                minZoom={1}
                maxZoom={3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="avatar-zoom"
              className="text-xs font-bold text-muted-foreground"
            >
              {t("avatar.zoom")}
            </label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {avatarError && (
            <p
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {avatarError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeCropEditor}
              disabled={avatarOperation !== "idle"}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("avatar.cancel")}
            </button>
            <button
              type="button"
              onClick={saveAvatar}
              disabled={!croppedArea || avatarOperation !== "idle"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {avatarOperation !== "idle" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {avatarOperation === "preparing"
                ? t("avatar.preparing")
                : avatarOperation === "uploading"
                  ? t("avatar.saving")
                  : t("avatar.savePhoto")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
