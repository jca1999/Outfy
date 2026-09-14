export type CreateActivityRequest = {
  title: string;
  description?: string;
  category: string;
  subcategory: string;
  startsAt: string;
  endsAt?: string;
  timezoneName: string;
  locationType: 'physical' | 'online';
  countryCode?: string;
  regionCode?: string;
  regionName?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  meetingPoint?: string;
  onlinePlatform?: string;
  participationMode: 'limited' | 'unlimited';
  maxParticipants?: number;
  costType: 'free' | 'paid' | 'each_own';
  estimatedCost?: number;
  currency?: string;
};

export type CreateActivityResponse = {
  activity: {
    id: string;
  };
};

export type ActivityDetail = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string;
  startsAt: string;
  endsAt: string | null;
  timezoneName: string;
  locationType: 'physical' | 'online';
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  meetingPoint: string | null;
  onlinePlatform: string | null;
  participationMode: 'limited' | 'unlimited';
  maxParticipants: number | null;
  costType: 'free' | 'paid' | 'each_own';
  estimatedCost: number | null;
  currency: string | null;
  status: 'active' | 'completed' | 'cancelled';
  organizer: {
    username: string | null;
    displayName: string | null;
  };
  memberCount: number;
};

export type ActivityDetailResponse = {
  activity: ActivityDetail;
};

export class ActivityApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ActivityApiError';
    this.status = status;
  }
}

export async function createActivity(input: CreateActivityRequest) {
  const response = await fetch('/api/activities', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | CreateActivityResponse
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'The activity could not be published.';
    throw new ActivityApiError(message, response.status);
  }

  return payload as CreateActivityResponse;
}

export async function getActivity(id: string) {
  const response = await fetch(`/api/activities/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | ActivityDetailResponse
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'The activity could not be loaded.';
    throw new ActivityApiError(message, response.status);
  }

  return payload as ActivityDetailResponse;
}