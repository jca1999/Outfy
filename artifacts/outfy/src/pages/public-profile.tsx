import {
  ArrowLeft,
  LockKeyhole,
  MapPin,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useRoute } from "wouter";

import {
  AuthApiError,
  getPublicProfile,
  type PublicProfile,
} from "@/auth/auth-api";

type LoadState = "loading" | "ready" | "notFound" | "error";

export function PublicProfile() {
  const { t } = useTranslation("profile");
  const [, navigate] = useLocation();
  const [, params] = useRoute("/users/:username");

  const username = params?.username ?? "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;

    if (!username) {
      setLoadState("notFound");
      return;
    }

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
    };
  }, [navigate, username]);

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
        </div>
      </div>
    );
  }

  const visibleName =
    profile.displayName?.trim() || `@${profile.username}`;

  const initials = (
    profile.displayName?.trim() ||
    profile.username
  )
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

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
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={t("publicProfile.avatarAlt", {
                  username: profile.username,
                })}
                className="h-full w-full object-cover"
              />
            ) : (
              initials || <UserRound className="h-8 w-8" />
            )}
          </div>

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
        </div>
      </section>
    </div>
  );
}