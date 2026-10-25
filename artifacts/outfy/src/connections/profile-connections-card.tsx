import { ArrowRight, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useConnectionOverview } from "./use-connection-overview";

export function ProfileConnectionsCard() {
  const { t } = useTranslation("profile");
  const [, navigate] = useLocation();
  const overview = useConnectionOverview();

  return (
    <button
      type="button"
      onClick={() => navigate("/connections")}
      className="group flex w-full items-center gap-4 rounded-[26px] border border-border bg-card p-6 text-left soft-shadow transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-8"
      data-testid="card-profile-connections"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-foreground">
        <Users className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{t("connections.title")}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-live="polite">
          {overview.isPending ? (
            <span className="text-muted-foreground">{t("connections.loading")}</span>
          ) : overview.isError ? (
            <span className="text-muted-foreground">{t("connections.unavailable")}</span>
          ) : (
            <>
              <span className="text-muted-foreground" data-testid="profile-connections-count">
                {t("connections.accepted", { count: overview.data.accepted.length })}
              </span>
              {overview.data.incoming.length > 0 && (
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-foreground" data-testid="profile-pending-count">
                  {t("connections.pending", { count: overview.data.incoming.length })}
                </span>
              )}
            </>
          )}
        </span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}
