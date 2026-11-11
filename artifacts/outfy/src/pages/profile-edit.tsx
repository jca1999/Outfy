import { ArrowLeft, Check, Edit3, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import { useAuth } from "@/auth/auth-context";
import { type HomeLocation, type ProfileInterest } from "@/auth/auth-api";
import { LocationPicker } from "@/components/location-picker";

const PROFILE_INTERESTS: ProfileInterest[] = [
  "sports",
  "music",
  "movies",
  "outdoors",
  "social",
  "food",
  "gaming",
  "board_games",
  "culture",
  "travel",
  "learning",
  "other",
];

export function ProfileEdit() {
  const { t } = useTranslation("profile");
  const { t: tActivities } = useTranslation("activities");

  const { user, updateProfile } = useAuth();

  const [, navigate] = useLocation();

  const [displayName, setDisplayName] = useState("");

  const [bio, setBio] = useState("");

  const [homeLocation, setHomeLocation] = useState<HomeLocation | null>(null);

  const [interests, setInterests] = useState<ProfileInterest[]>([]);

  const [locationValid, setLocationValid] = useState(true);

  const [locationTouched, setLocationTouched] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");

    setBio(user?.bio ?? "");

    setHomeLocation(user?.homeLocation ?? null);

    setInterests(user?.interests ?? []);

    setLocationValid(true);
    setLocationTouched(false);
  }, [user]);

  function toggleInterest(interest: ProfileInterest) {
    setInterests((current) => {
      if (current.includes(interest)) {
        return current.filter((item) => item !== interest);
      }

      if (current.length >= 5) {
        return current;
      }

      return [...current, interest];
    });
  }

  async function handleSave() {
    const normalizedName = displayName.trim();

    setError("");

    if (normalizedName.length > 60) {
      setError(t("messages.nameTooLong"));
      return;
    }

    if (!locationValid) {
      setError(t("messages.locationIncomplete"));
      return;
    }

    setSaving(true);

    try {
      const profileUpdate: {
        displayName: string;
        bio: string;
        homeLocation?: HomeLocation | null;
        interests: ProfileInterest[];
      } = {
        displayName: normalizedName,
        bio,
        interests,
      };

      if (locationTouched) {
        profileUpdate.homeLocation = homeLocation;
      }

      await updateProfile(profileUpdate);

      navigate("/profile");
    } catch {
      setError(t("messages.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />

            {t("navigation.backToProfile")}
          </button>

          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
            {t("editProfile.eyebrow")}
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
            {t("editProfile.title")}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t("editProfile.description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            disabled={saving}
            className="rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted disabled:opacity-60"
          >
            {t("editProfile.cancel")}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Edit3 className="h-3.5 w-3.5" />
            )}

            {saving ? t("header.saving") : t("header.save")}
          </button>
        </div>
      </div>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <div>
          <label
            htmlFor="display-name"
            className="mb-2 block text-sm font-bold"
          >
            {t("identity.displayName")}
          </label>

          <input
            id="display-name"
            type="text"
            value={displayName}
            maxLength={60}
            onChange={(event) => setDisplayName(event.target.value)}
            className="auth-input"
            placeholder={t("identity.displayNamePlaceholder")}
            autoComplete="name"
          />

          <p className="mt-2 text-xs text-muted-foreground">
            {t("identity.displayNameHelp")}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {t("identity.displayNameFallback", {
              username: user?.username,
            })}
          </p>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="profile-bio" className="text-sm font-bold">
              {t("identity.bio.label")}
            </label>

            <span className="text-xs font-semibold text-muted-foreground">
              {bio.length} / 300
            </span>
          </div>

          <textarea
            id="profile-bio"
            value={bio}
            maxLength={300}
            rows={4}
            onChange={(event) => setBio(event.target.value)}
            disabled={saving}
            placeholder={t("identity.bio.placeholder")}
            className="auth-input mt-2 min-h-[110px] resize-none"
          />

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("identity.bio.help")}
          </p>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <p className="mb-2 text-sm font-bold">
            {t("identity.location.label")}
          </p>

          <LocationPicker
            value={homeLocation}
            onChange={(nextLocation) => {
              setHomeLocation(nextLocation);

              setLocationTouched(true);
            }}
            onValidityChange={setLocationValid}
            disabled={saving}
          />
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold">{t("interests.title")}</p>

              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                {t("interests.description")}
              </p>
            </div>

            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              {t("interests.selected", {
                count: interests.length,
              })}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {PROFILE_INTERESTS.map((interest) => {
              const selected = interests.includes(interest);

              const disabled = saving || (!selected && interests.length >= 5);

              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => toggleInterest(interest)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {selected && <Check className="h-3.5 w-3.5" />}

                  {tActivities(`categories.${interest}`)}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {interests.length >= 5
              ? t("interests.maxReached")
              : t("interests.maxHint")}
          </p>
        </div>

        {error && (
          <p className="auth-error mt-5" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
