import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ProfileInterest } from '@/auth/auth-api';

type ProfileInterestsCardProps = {
  interests: ProfileInterest[];
};

export function ProfileInterestsCard({
  interests,
}: ProfileInterestsCardProps) {
  const { t } = useTranslation('profile');
  const { t: tActivities } = useTranslation('activities');

  if (interests.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[26px] border border-border bg-card p-5 soft-shadow sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Heart className="h-5 w-5 text-primary" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-[-.03em]">
            {t('interests.profileTitle')}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {t('interests.profileDescription')}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {interests.map((interest) => (
          <span
            key={interest}
            className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-bold text-primary"
          >
            {tActivities(`categories.${interest}`)}
          </span>
        ))}
      </div>
    </section>
  );
}