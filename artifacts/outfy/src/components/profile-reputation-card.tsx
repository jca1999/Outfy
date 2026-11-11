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
    <section className="border-b border-border/80 pb-5 sm:pb-6">
      <div>
        <h2 className="text-xl font-bold tracking-[-.03em]">
          {t("reputationCard.title")}
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {t("reputationCard.description")}
        </p>
      </div>

      {reputation.reviewCount === 0 ? (
        <div className="mt-5 flex min-h-[105px] w-full items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-muted/15 px-5 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Star className="h-6 w-6 fill-current text-primary" />
            </div>

            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-[-.05em]">
                  —
                </span>

                <span className="text-sm font-semibold text-muted-foreground">
                  / 5
                </span>
              </div>

              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {t("reputationCard.noReviews")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <div className="flex min-w-0 flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 sm:h-[72px] sm:w-[72px]">
              <Star className="h-8 w-8 fill-current text-primary" />
            </div>

            <div className="mt-4 flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold tracking-[-.06em] sm:text-4xl">
                {reputation.averageRating !== null
                  ? reputation.averageRating.toFixed(1)
                  : "—"}
              </span>

              <span className="text-sm font-semibold text-muted-foreground">
                / 5
              </span>
            </div>

            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {t("reputationCard.reviews", {
                count: reputation.reviewCount,
              })}
            </p>
          </div>

          <div className="min-w-0 space-y-2.5 sm:space-y-3">
            {RATINGS.map((rating) => {
              const count =
                reputation.ratingDistribution[rating];

              const percentage = Math.round(
                (count / reputation.reviewCount) * 100,
              );

              return (
                <div
                  key={rating}
                  className="grid grid-cols-[34px_minmax(0,1fr)_32px] items-center gap-2 sm:gap-3"
                  aria-label={t(
                    "reputationCard.ratingBreakdown",
                    {
                      rating,
                      count,
                    },
                  )}
                >
                  <span className="flex items-center gap-1 text-xs font-bold">
                    {rating}
                    <Star className="h-3 w-3 fill-current text-primary" />
                  </span>

                  <div className="h-2 overflow-hidden rounded-full bg-muted">
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
      )}
    </section>
  );
}
