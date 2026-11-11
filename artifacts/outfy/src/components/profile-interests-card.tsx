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
    <section className="border-b border-border/80 pb-5 sm:pb-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Heart className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-[-.03em]">
            {t('interests.profileTitle')}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {t('interests.profileDescription')}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {interests.map((interest) => (
          <span
            key={interest}
            className="max-w-full break-words rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary sm:px-4 sm:py-2 [overflow-wrap:anywhere]"
          >
            {tActivities(`categories.${interest}`)}
          </span>
        ))}
      </div>
    </section>
  );
}