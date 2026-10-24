import { Check, Clock3, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  acceptConnection,
  deleteConnection,
  getRelationship,
  sendConnectionRequest,
  type Relationship,
} from "@/connections/connections-api";
import { ActionButton, InlineError, RemoveConnectionDialog } from "@/connections/connection-ui";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; relationship: Relationship | null };

export function ProfileRelationship({
  userId,
  name,
  onChanged,
}: {
  userId: string;
  name: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation(["profile", "common"]);
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const seq = useRef(0);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback((silent = false) => {
    const current = ++seq.current;
    if (!silent) setState({ status: "loading" });
    getRelationship(userId)
      .then((r) => current === seq.current && setState({ status: "ready", relationship: r.relationship }))
      .catch(() => current === seq.current && setState({ status: "error" }));
  }, [userId]);

  useEffect(() => {
    load();
    const refresh = () => {
      if (busyRef.current) return;
      load(true);
      onChangedRef.current();
    };
    const onFocus = refresh;
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      seq.current++;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(key);
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
        setBusy(null);
        load(true);
        onChangedRef.current();
      }
    }
    return ok;
  }

  if (state.status === "loading") {
    return <div className="mt-6 h-10 w-40 animate-pulse rounded-xl bg-muted" data-testid="status-relationship-loading" />;
  }
  if (state.status === "error") {
    return (
      <div className="mt-6 w-full">
        <InlineError message={t("publicProfile.connectionError")} onRetry={() => load()} testId="error-relationship" />
      </div>
    );
  }

  const rel = state.relationship;
  const disabled = busy !== null;

  return (
    <div className="mt-6 flex w-full flex-col items-center gap-3" data-testid="section-relationship">
      {!rel && (
        <ActionButton busy={busy === "send"} disabled={disabled} onClick={() => run("send", () => sendConnectionRequest(userId))} testId="button-connect">
          <UserPlus className="h-3.5 w-3.5" />{t("common:connections.connect")}
        </ActionButton>
      )}
      {rel?.status === "pending" && rel.direction === "outgoing" && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground" data-testid="status-request-sent">
            <Clock3 className="h-3.5 w-3.5" />{t("publicProfile.requestSent")}
          </span>
          <ActionButton variant="ghost" busy={busy === "cancel"} disabled={disabled} onClick={() => run("cancel", () => deleteConnection(rel.id, "cancel"))} testId="button-cancel-request">
            {t("common:connections.cancel")}
          </ActionButton>
        </div>
      )}
      {rel?.status === "pending" && rel.direction === "incoming" && (
        <>
          <p className="text-sm font-semibold" data-testid="status-incoming-request">{t("publicProfile.incomingRequest")}</p>
          <div className="flex gap-2">
            <ActionButton busy={busy === "accept"} disabled={disabled} onClick={() => run("accept", () => acceptConnection(rel.id))} testId="button-accept-request">
              <Check className="h-3.5 w-3.5" />{t("common:connections.accept")}
            </ActionButton>
            <ActionButton variant="danger" busy={busy === "reject"} disabled={disabled} onClick={() => run("reject", () => deleteConnection(rel.id, "reject"))} testId="button-reject-request">
              <X className="h-3.5 w-3.5" />{t("common:connections.reject")}
            </ActionButton>
          </div>
        </>
      )}
      {rel?.status === "accepted" && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary" data-testid="status-connected">
            <Check className="h-3.5 w-3.5" />{t("publicProfile.connected")}
          </span>
          <ActionButton variant="danger" disabled={disabled} onClick={() => setConfirmRemove(true)} testId="button-remove-connection">
            {t("common:connections.remove")}
          </ActionButton>
          <RemoveConnectionDialog
            open={confirmRemove}
            name={name}
            busy={busy === "remove"}
            onOpenChange={setConfirmRemove}
            onConfirm={async () => {
              if (await run("remove", () => deleteConnection(rel.id, "remove"))) setConfirmRemove(false);
            }}
          />
        </div>
      )}
      {actionError && <InlineError message={t("common:connections.actionError")} testId="error-relationship-action" />}
    </div>
  );
}
