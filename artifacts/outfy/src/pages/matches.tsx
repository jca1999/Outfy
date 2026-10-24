import { Check, Clock3, MapPin, Sparkles, UserPlus, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

import {
  acceptConnection,
  deleteConnection,
  getConnectionSuggestions,
  getConnections,
  sendConnectionRequest,
  type ConnectionEntry,
  type ConnectionOverview,
  type ConnectionProfile,
} from "@/connections/connections-api";
import {
  ActionButton,
  ConnectionAvatar,
  InlineError,
  RemoveConnectionDialog,
  profileName,
} from "@/connections/connection-ui";

type Load<T> = { status: "loading" | "ready" | "error"; data: T | null };

export function Matches() {
  const { t } = useTranslation("common");
  const [overview, setOverview] = useState<Load<ConnectionOverview>>({ status: "loading", data: null });
  const [suggestions, setSuggestions] = useState<Load<ConnectionProfile[]>>({ status: "loading", data: null });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [removing, setRemoving] = useState<ConnectionEntry | null>(null);
  const overviewSeq = useRef(0);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      overviewSeq.current++;
      suggestionsSeq.current++;
    };
  }, []);
  const suggestionsSeq = useRef(0);

  const loadOverview = useCallback((silent = false, keepOnError = false) => {
    const seq = ++overviewSeq.current;
    if (!silent) setOverview((c) => ({ status: "loading", data: c.data }));
    getConnections()
      .then((data) => seq === overviewSeq.current && setOverview({ status: "ready", data }))
      .catch(() => seq === overviewSeq.current && setOverview((c) => (keepOnError && c.data ? c : { status: "error", data: null })));
  }, []);

  const loadSuggestions = useCallback((silent = false, keepOnError = false) => {
    const seq = ++suggestionsSeq.current;
    if (!silent) setSuggestions((c) => ({ status: "loading", data: c.data }));
    getConnectionSuggestions()
      .then((r) => seq === suggestionsSeq.current && setSuggestions({ status: "ready", data: r.profiles }))
      .catch(() => seq === suggestionsSeq.current && setSuggestions((c) => (keepOnError && c.data ? c : { status: "error", data: null })));
  }, []);

  const refreshAll = useCallback((silent = false, keepOnError = false) => {
    loadOverview(silent, keepOnError);
    loadSuggestions(silent, keepOnError);
  }, [loadOverview, loadSuggestions]);

  useEffect(() => {
    refreshAll();
    const onFocus = () => !busyRef.current && refreshAll(true, true);
    const onVisible = () => document.visibilityState === "visible" && !busyRef.current && refreshAll(true, true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAll]);

  async function run(key: string, action: () => Promise<unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusyKey(key);
    setActionError(false);
    let ok = true;
    try {
      await action();
    } catch {
      ok = false;
      setActionError(true);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusyKey(null);
        // After a mutation, a failed refetch must surface error/retry, not stale cards.
        refreshAll(true, false);
      }
    }
    return ok;
  }

  const busy = busyKey !== null;
  const data = overview.data;
  const requestCount = data ? data.incoming.length + data.outgoing.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{t("connections.eyebrow")}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">{t("connections.title")}</h1>
        </div>
      </div>

      <div className="rounded-[22px] bg-sidebar p-5 text-sidebar-foreground sm:p-6">
        <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/55">{t("connections.notDating")}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">{t("connections.heroTitle")}</h2>
      </div>

      {actionError && <InlineError message={t("connections.actionError")} testId="error-connection-action" />}

      <Section title={t("connections.requestsTitle")} count={overview.status === "ready" ? requestCount : undefined} testId="section-requests">
        {overview.status === "error" ? (
          <InlineError message={t("connections.loadError")} onRetry={() => loadOverview()} testId="error-overview" />
        ) : !data ? (
          <RowSkeletons />
        ) : requestCount === 0 ? (
          <Empty text={t("connections.noRequests")} />
        ) : (
          <div className="space-y-5">
            {data.incoming.length > 0 && (
              <SubList label={t("connections.incomingTitle")}>
                {data.incoming.map((e) => (
                  <PersonRow key={e.relationship.id} profile={e.profile} tag={<Tag icon={<UserPlus className="h-3 w-3" />} text={t("connections.incomingLabel")} accent />}>
                    <ActionButton busy={busyKey === `accept-${e.relationship.id}`} disabled={busy} onClick={() => run(`accept-${e.relationship.id}`, () => acceptConnection(e.relationship.id))} testId={`button-accept-${e.relationship.id}`}>
                      <Check className="h-3.5 w-3.5" />{t("connections.accept")}
                    </ActionButton>
                    <ActionButton variant="danger" busy={busyKey === `reject-${e.relationship.id}`} disabled={busy} onClick={() => run(`reject-${e.relationship.id}`, () => deleteConnection(e.relationship.id, "reject"))} testId={`button-reject-${e.relationship.id}`}>
                      <X className="h-3.5 w-3.5" />{t("connections.reject")}
                    </ActionButton>
                  </PersonRow>
                ))}
              </SubList>
            )}
            {data.outgoing.length > 0 && (
              <SubList label={t("connections.outgoingTitle")}>
                {data.outgoing.map((e) => (
                  <PersonRow key={e.relationship.id} profile={e.profile} tag={<Tag icon={<Clock3 className="h-3 w-3" />} text={t("connections.outgoingLabel")} />}>
                    <ActionButton variant="ghost" busy={busyKey === `cancel-${e.relationship.id}`} disabled={busy} onClick={() => run(`cancel-${e.relationship.id}`, () => deleteConnection(e.relationship.id, "cancel"))} testId={`button-cancel-${e.relationship.id}`}>
                      {t("connections.cancel")}
                    </ActionButton>
                  </PersonRow>
                ))}
              </SubList>
            )}
          </div>
        )}
      </Section>

      <Section title={t("connections.myConnectionsTitle")} count={data && overview.status === "ready" ? data.accepted.length : undefined} testId="section-accepted">
        {overview.status === "error" ? (
          <InlineError message={t("connections.loadError")} onRetry={() => loadOverview()} />
        ) : !data ? (
          <RowSkeletons />
        ) : data.accepted.length === 0 ? (
          <Empty text={t("connections.noConnections")} hint={t("connections.noConnectionsHint")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.accepted.map((e) => (
              <PersonRow key={e.relationship.id} profile={e.profile} tag={<Tag icon={<Check className="h-3 w-3" />} text={t("connections.connected")} accent />}>
                <ActionButton variant="danger" disabled={busy} onClick={() => setRemoving(e)} testId={`button-remove-${e.relationship.id}`}>
                  {t("connections.remove")}
                </ActionButton>
              </PersonRow>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("connections.suggestionsTitle")} icon={<Sparkles className="h-3.5 w-3.5" />} testId="section-suggestions">
        {suggestions.status === "error" ? (
          <InlineError message={t("connections.loadError")} onRetry={() => loadSuggestions()} testId="error-suggestions" />
        ) : !suggestions.data ? (
          <RowSkeletons />
        ) : suggestions.data.length === 0 ? (
          <Empty text={t("connections.noSuggestions")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.data.map((p) => (
              <PersonRow key={p.id} profile={p}>
                <ActionButton busy={busyKey === `send-${p.id}`} disabled={busy} onClick={() => run(`send-${p.id}`, () => sendConnectionRequest(p.id))} testId={`button-connect-${p.id}`}>
                  <UserPlus className="h-3.5 w-3.5" />{t("connections.connect")}
                </ActionButton>
              </PersonRow>
            ))}
          </div>
        )}
      </Section>

      <RemoveConnectionDialog
        open={removing !== null}
        name={removing ? profileName(removing.profile) : ""}
        busy={busyKey === "remove"}
        onOpenChange={(open) => !open && setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const ok = await run("remove", () => deleteConnection(removing.relationship.id, "remove"));
          if (ok) setRemoving(null);
        }}
      />
    </div>
  );
}

function Section({ title, count, icon, testId, children }: { title: string; count?: number; icon?: React.ReactNode; testId: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-.03em]">
        {icon && <span className="text-primary">{icon}</span>}
        {title}
        {count !== undefined && <span className="font-mono-ui rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function SubList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </div>
  );
}

function Tag({ icon, text, accent }: { icon: React.ReactNode; text: string; accent?: boolean }) {
  return (
    <span className={accent ? "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary" : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"}>
      {icon}{text}
    </span>
  );
}

function PersonRow({ profile, tag, children }: { profile: ConnectionProfile; tag?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const name = profileName(profile);
  return (
    <article className="animate-rise-in flex flex-wrap items-center gap-3 rounded-[20px] border border-border bg-card p-3.5" data-testid={`card-person-${profile.id}`}>
      <Link href={`/users/${encodeURIComponent(profile.username)}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={t("connections.viewProfile", { name })} data-testid={`link-profile-${profile.id}`}>
        <ConnectionAvatar profile={profile} className="h-12 w-12 text-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{name}</p>
          {profile.displayName && <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {tag}
            {profile.city && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 text-primary" />{profile.city}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex gap-2">{children}</div>
    </article>
  );
}

function RowSkeletons() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-[20px] border border-border bg-card p-3.5">
          <div className="h-12 w-12 rounded-full bg-muted" />
          <div className="space-y-2"><div className="h-3.5 w-28 rounded bg-muted" /><div className="h-3 w-16 rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-card p-6 text-center">
      <UserRound className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm font-bold">{text}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
