import { Loader2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { saveActivityReview, type ActivityDetail, type SaveActivityReviewResponse } from "./activity-api";

export function ActivityReviewForm({ activity, onSaved }: {
  activity: ActivityDetail;
  onSaved: (result: SaveActivityReviewResponse) => void;
}) {
  const { t } = useTranslation("activities");
  const [rating, setRating] = useState(activity.myReview?.rating ?? 0);
  const [comment, setComment] = useState(activity.myReview?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "saveError" | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setRating(activity.myReview?.rating ?? 0);
    setComment(activity.myReview?.comment ?? "");
  }, [activity.id, activity.myReview?.rating, activity.myReview?.comment]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || rating < 1 || rating > 5 || comment.length > 1000) return;
    pending.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveActivityReview(activity.id, { rating, comment });
      if (!mounted.current) return;
      onSaved(result);
      setMessage("saved");
    } catch {
      if (mounted.current) setMessage("saveError");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-busy={saving}>
      <div>
        <h3 className="text-base font-bold">{t("myPlans.review.yourReview")}</h3>
        {!activity.myReview && <p className="mt-1 text-sm text-muted-foreground">{t("myPlans.review.prompt")}</p>}
      </div>
      <fieldset disabled={saving} className="space-y-4">
        <div>
          <p className="text-sm font-bold">{t("myPlans.review.ratingLabel")}</p>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map(value => (
              <button key={value} type="button" onClick={() => { setRating(value); setMessage(null); }}
                aria-label={t("myPlans.review.starAriaLabel", { rating: value })}
                aria-pressed={rating === value}
                className="rounded-lg p-1.5 transition hover:bg-muted disabled:cursor-not-allowed">
                <Star aria-hidden="true" className={`h-8 w-8 ${value <= rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="activity-review-comment" className="text-sm font-bold">{t("myPlans.review.commentLabel")}</label>
          <textarea id="activity-review-comment" value={comment} maxLength={1000} rows={4}
            onChange={event => { setComment(event.target.value); setMessage(null); }}
            placeholder={t("myPlans.review.commentPlaceholder")}
            className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary disabled:opacity-60" />
          <p className="mt-1 text-right font-mono-ui text-[10px] text-muted-foreground">{comment.length}/1000</p>
        </div>
        <button type="submit" disabled={saving || rating < 1 || rating > 5}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
          {saving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {t(saving ? "myPlans.review.saving" : activity.myReview ? "myPlans.review.update" : "myPlans.review.save")}
        </button>
      </fieldset>
      {message && <p role={message === "saveError" ? "alert" : "status"} className={`text-sm ${message === "saveError" ? "text-destructive" : "text-primary"}`}>{t(`myPlans.review.${message}`)}</p>}
    </form>
  );
}
