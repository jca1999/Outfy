import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ProfileReputation } from "@/activities/activity-api";

type ProfileReputationCardProps = {
  reputation: ProfileReputation;
};

const RATINGS = [5, 4, 3, 2, 1] as const;

export function ProfileReputationCard({
  reputation,
}: ProfileReputationCardProps) {
  const { t } = useTranslation("profile");

  return (
    <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
      <div>
        <h2 className="text-xl font-bold tracking-[-.03em]">
          {t("reputationCard.title")}
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {t("reputationCard.description")}
        </p>
      </div>

      <div className="mt-6 grid gap-7 sm:grid-cols-[180px_1fr] sm:items-center">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Star className="h-9 w-9 fill-current text-primary" />
          </div>

          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold tracking-[-.06em]">
              {reputation.averageRating !== null
                ? reputation.averageRating.toFixed(1)
                : "—"}
            </span>

            <span className="text-sm font-semibold text-muted-foreground">
              / 5
            </span>
          </div>

          {reputation.reviewCount > 0 ? (
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {t("reputationCard.reviews", {
                count: reputation.reviewCount,
              })}
            </p>
          ) : (
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {t("reputationCard.noReviews")}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {RATINGS.map((rating) => {
            const count = reputation.ratingDistribution[rating];

            const percentage =
              reputation.reviewCount > 0
                ? Math.round(
                    (count / reputation.reviewCount) * 100,
                  )
                : 0;

            return (
              <div
                key={rating}
                className="grid grid-cols-[34px_1fr_32px] items-center gap-3"
                aria-label={t("reputationCard.ratingBreakdown", {
                  rating,
                  count,
                })}
              >
                <span className="flex items-center gap-1 text-xs font-bold">
                  {rating}
                  <Star className="h-3 w-3 fill-current text-primary" />
                </span>

                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>

                <span className="text-right text-xs font-semibold text-muted-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}