import { BellRing, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDevicePush } from "./use-device-push";

/** A separate delivery/device control; category preference toggles stay unchanged. */
export function DevicePushSettings() {
  const { t } = useTranslation("common");
  const push = useDevicePush();
  const denied = push.permission === "denied";
  const message = !push.supported ? "unsupported" : denied ? "denied"
    : !push.configured ? "unavailable" : push.subscribed ? "enabled" : "notEnabled";
  return (
    <div className="mt-5 border-t border-border pt-5" aria-busy={push.loading || push.busy}>
      <div className="flex items-start gap-3">
        <BellRing aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t("push.title")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("push.description")}</p>
          <div className="mt-3 text-xs leading-relaxed" aria-live="polite" role="status">
            {push.loading
              ? <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{t("push.loading")}
                </span>
              : <p className={push.subscribed ? "font-medium text-primary" : "text-muted-foreground"}>{t(`push.${message}`)}</p>}
          </div>
          {!push.loading && !push.supported && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("push.iosHint")}</p>}
          {push.error && <p role="alert" className="mt-2 text-xs leading-relaxed text-destructive">
            {t(`push.${push.error}`)} {push.error === "enableError" && t("push.iosHint")}
          </p>}
          {!push.loading && push.supported && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {denied && (
                <>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button type="button" disabled={push.busy}
                        className="min-h-10 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                        {t("push.permissionHelp")}
                      </button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border text-foreground">
                      <DialogHeader className="pr-5">
                        <DialogTitle className="leading-snug">{t("push.permissionHelp")}</DialogTitle>
                        <DialogDescription>{t("push.permissionHelpDescription")}</DialogDescription>
                      </DialogHeader>
                      {([
                        ["android", ["open", "controls", "permissions", "allow"]],
                        ["ios", ["homeScreen", "settings", "find", "allow"]],
                        ["desktop", ["permissions", "allow"]],
                      ] as const).map(([platform, steps]) => (
                        <section key={platform} aria-labelledby={`push-help-${platform}`}>
                          <h4 id={`push-help-${platform}`} className="text-sm font-semibold">
                            {t(`push.permissionInstructions.${platform}.title`)}
                          </h4>
                          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                            {steps.map(step => (
                              <li key={step}>{t(`push.permissionInstructions.${platform}.${step}`)}</li>
                            ))}
                            <li>{t("push.permissionInstructions.return")}</li>
                          </ol>
                        </section>
                      ))}
                    </DialogContent>
                  </Dialog>
                  <button type="button" disabled={push.busy} onClick={() => { void push.refresh(); }}
                    className="min-h-10 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50">
                    {t("push.checkPermission")}
                  </button>
                </>
              )}
              {!push.subscribed && !denied && push.configured && (
                <button type="button" disabled={push.busy} onClick={() => { void push.enable(); }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                  {push.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {t("push.enable")}
                </button>
              )}
              {(push.subscribed || push.hasSubscription) && (
                <button type="button" disabled={push.busy} onClick={() => { void push.disable(); }}
                  className="min-h-10 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50">
                  {t("push.disable")}
                </button>
              )}
              {!denied && (push.error || !push.configured) && (
                <button type="button" disabled={push.busy} onClick={() => { void push.refresh(); }}
                  className="min-h-10 rounded-xl px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50">
                  {t("push.retry")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
