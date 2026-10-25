import { ArrowRight, Check, Loader2, MapPin, RotateCw, UserPlus, Users } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/auth/auth-context";
import { ConnectionAvatar, profileName } from "@/connections/connection-ui";
import { useConnectionOverview } from "@/connections/use-connection-overview";
import { cn } from "@/utils";
import type { FollowListKind } from "./follows-state";
import { useFollowList, useFollowMutation, useFollowRelationship } from "./use-follows";

function RetryButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  const { t } = useTranslation("profile");
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold transition hover:bg-muted"
      data-testid={testId}
    >
      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
      {t("follows.retry")}
    </button>
  );
}

function CountButton({ count, label, onClick, testId, tiles = false }: { count: number; label: string; onClick: (opener: HTMLButtonElement) => void; testId: string; tiles?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      className={cn(
        "group inline-flex rounded-xl px-2 py-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tiles ? "min-w-0 flex-col items-center gap-1" : "items-baseline gap-1.5",
      )}
      data-testid={testId}
    >
      <span className="text-base font-bold tabular-nums tracking-[-.03em] text-foreground">{count}</span>
      <span className="text-xs text-muted-foreground group-hover:text-foreground sm:text-sm">{label}</span>
    </button>
  );
}

/** Followers / following counters. Opens the shared list dialog. */
export function FollowCounters({ targetId, className, tiles = false }: { targetId: string; className?: string; tiles?: boolean }) {
  const { t } = useTranslation("profile");
  const relation = useFollowRelationship(targetId);
  const [openKind, setOpenKind] = useState<FollowListKind | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  function openList(kind: FollowListKind, button: HTMLButtonElement) {
    opener.current = button;
    setOpenKind(kind);
  }

  let body;
  if (relation.isPending) {
    body = (
      <div className="flex animate-pulse gap-3" aria-label={t("follows.loading")}>
        <div className="h-6 w-20 max-w-full rounded-full bg-muted" />
        <div className="h-6 w-20 max-w-full rounded-full bg-muted" />
      </div>
    );
  } else if (relation.isError) {
    body = (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">
        <span>{t("follows.unavailable")}</span>
        <RetryButton onClick={() => void relation.refetch()} testId="button-retry-follow-counts" />
      </div>
    );
  } else {
    const d = relation.data;
    body = (
      <div className={tiles ? "grid grid-cols-2" : "flex flex-wrap items-center gap-1"} aria-live="polite">
        <CountButton
          count={d.followersCount}
          label={t("follows.followersLabel", { count: d.followersCount })}
          onClick={(button) => openList("followers", button)}
          testId="button-open-followers"
          tiles={tiles}
        />
        {!tiles && <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />}
        <CountButton
          count={d.followingCount}
          label={t("follows.followingLabel", { count: d.followingCount })}
          onClick={(button) => openList("following", button)}
          testId="button-open-following"
          tiles={tiles}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {body}
      <FollowListDialog
        targetId={targetId}
        kind={openKind}
        onKindChange={setOpenKind}
        returnFocusRef={opener}
      />
    </div>
  );
}

/** Follow / Following toggle + "Follows you" indicator. Distinct from Connections. */
export function FollowControls({ targetId }: { targetId: string }) {
  const { t } = useTranslation("profile");
  const relation = useFollowRelationship(targetId);
  const mutation = useFollowMutation(targetId);
  const busy = useRef(false);

  if (relation.isPending) {
    return <div className="h-10 w-32 animate-pulse rounded-full bg-muted" />;
  }
  if (relation.isError) return null; // counters already show retry; never guess state

  const { isFollowing, followsYou } = relation.data;

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    mutation.reset();
    try {
      await mutation.mutateAsync(!isFollowing);
    } catch {
      // error displayed below; counts untouched
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={mutation.isPending}
          aria-label={isFollowing ? t("follows.unfollow") : t("follows.follow")}
          aria-pressed={isFollowing}
          className={cn(
            "group inline-flex min-w-[8.5rem] items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-70",
            isFollowing
              ? "border border-border bg-card text-foreground hover:bg-muted"
              : "bg-primary text-primary-foreground outfy-primary-action",
          )}
          data-testid="button-toggle-follow"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : isFollowing ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isFollowing ? (
            <>
              <span className="group-hover:hidden">{t("follows.following")}</span>
              <span className="hidden group-hover:inline">{t("follows.unfollow")}</span>
            </>
          ) : t("follows.follow")}
        </button>
        {followsYou && (
          <span
            className="rounded-full bg-primary/15 px-2.5 py-1 font-mono-ui text-[10px] font-semibold uppercase tracking-[.14em] text-foreground"
            data-testid="status-follows-you"
          >
            {t("follows.followsYou")}
          </span>
        )}
      </div>
      {mutation.isError && (
        <p className="text-xs text-destructive" role="alert" data-testid="text-follow-error">
          {t("follows.mutationError")}
        </p>
      )}
    </div>
  );
}

export function FollowListDialog({
  targetId,
  kind,
  onKindChange,
  returnFocusRef,
}: {
  targetId: string;
  kind: FollowListKind | null;
  onKindChange: (kind: FollowListKind | null) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("profile");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const open = kind !== null;
  const active: FollowListKind = kind ?? "followers";
  const list = useFollowList(targetId, active, open);
  const navigating = useRef(false);

  function goTo(username: string) {
    navigating.current = true;
    onKindChange(null);
    navigate(`/users/${encodeURIComponent(username)}`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onKindChange(null); }}>
      <DialogContent
        className="flex max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[26px] p-0"
        closeLabel={t("follows.close")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!navigating.current) returnFocusRef.current?.focus();
          navigating.current = false;
        }}
      >
        <Tabs value={active} onValueChange={(v) => onKindChange(v as FollowListKind)} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-xl font-bold tracking-[-.04em]">{t("follows.dialogTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("follows.dialogDescription")}</DialogDescription>
            <TabsList className="mt-3 grid w-full grid-cols-2 rounded-full">
              <TabsTrigger value="followers" className="rounded-full" data-testid="tab-followers">{t("follows.tabFollowers")}</TabsTrigger>
              <TabsTrigger value="following" className="rounded-full" data-testid="tab-following">{t("follows.tabFollowing")}</TabsTrigger>
            </TabsList>
        </DialogHeader>
        <TabsContent value={active} className="m-0 min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
          {list.isPending ? (
            <ul className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex animate-pulse items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-muted" />
                  <div className="space-y-2"><div className="h-3.5 w-32 rounded bg-muted" /><div className="h-3 w-20 rounded bg-muted" /></div>
                </li>
              ))}
            </ul>
          ) : list.isError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground">
              <p>{t("follows.listError")}</p>
              <RetryButton onClick={() => void list.refetch()} testId="button-retry-follow-list" />
            </div>
          ) : list.data.profiles.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground" data-testid="text-follow-empty">
                {t(active === "followers"
                  ? targetId === user?.id ? "follows.emptyOwnFollowers" : "follows.emptyFollowers"
                  : targetId === user?.id ? "follows.emptyOwnFollowing" : "follows.emptyFollowing")}
              </p>
            </div>
          ) : (
            <ul>
              {list.data.profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => goTo(p.username)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid={`button-follow-profile-${p.id}`}
                  >
                    <ConnectionAvatar profile={p} className="h-11 w-11 shrink-0 text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{profileName(p)}</span>
                      {p.displayName && <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>}
                      {p.city && (
                        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />{p.city}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Own profile: one card for followers, following and accepted connections. */
export function OwnSocialCard() {
  const { t } = useTranslation("profile");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const overview = useConnectionOverview();

  return (
    <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8" data-testid="card-profile-social">
      <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{t("follows.eyebrow")}</p>
      <div className="mt-3 grid grid-cols-3 items-start">
      {user?.id && <FollowCounters key={user.id} targetId={user.id} tiles className="col-span-2 min-w-0" />}
      <button
        type="button"
        onClick={() => navigate("/connections")}
        className="group flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid="card-profile-connections"
      >
          <span className="flex flex-col items-center gap-1" aria-live="polite">
            {overview.isPending ? (
              <span className="text-muted-foreground">{t("connections.loading")}</span>
            ) : overview.isError ? (
              <span className="text-muted-foreground">{t("connections.unavailable")}</span>
            ) : (
              <>
                <span className="text-base font-bold tabular-nums" data-testid="profile-connections-count">
                  {overview.data.accepted.length}
                </span>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {t("follows.connectionsLabel", { count: overview.data.accepted.length })}
                </span>
              </>
            )}
          </span>
      </button>
      </div>
      {overview.data && !overview.isError && overview.data.incoming.length > 0 && (
        <button type="button" onClick={() => navigate("/connections")} className="mt-3 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold" data-testid="profile-pending-count">
          {t("connections.pending", { count: overview.data.incoming.length })}
        </button>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("follows.distinctHint")}</p>
    </section>
  );
}
