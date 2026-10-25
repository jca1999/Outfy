import {
  ArrowLeft,
  LockKeyhole,
  MapPin,
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
import { ConnectionAvatar } from "@/connections/connection-ui";
import { ProfileRelationship } from "@/connections/profile-relationship";

type LoadState = "loading" | "ready" | "notFound" | "error";

export function PublicProfile() {
  const { t } = useTranslation("profile");
  const [, navigate] = useLocation();
  const [, params] = useRoute("/users/:username");

  const username = params?.username ?? "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const refreshSeq = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

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
            onChanged={refreshProfile}
          />
        </div>
      </section>
    </div>
  );
}