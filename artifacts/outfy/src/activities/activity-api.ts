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
  membershipRole: 'organizer' | 'participant' | null;
};

export type ActivityDetailResponse = {
  activity: ActivityDetail;
};

export type MyCreatedActivity = Pick<
  ActivityDetail,
  | 'id'
  | 'title'
  | 'category'
  | 'subcategory'
  | 'startsAt'
  | 'endsAt'
  | 'timezoneName'
  | 'locationType'
  | 'city'
  | 'onlinePlatform'
  | 'participationMode'
  | 'maxParticipants'
  | 'memberCount'
  | 'status'
>;

export type MyCreatedActivitiesResponse = {
  activities: MyCreatedActivity[];
};

export type ActivityMembershipResponse = {
  result: 'joined' | 'already_member' | 'left' | 'not_member';
  memberCount: number;
  maxParticipants: number | null;
};

export class ActivityApiError extends Error {
  status: number;
  code?: string;
  memberCount?: number;
  maxParticipants?: number | null;

  constructor(
    message: string,
    status: number,
    details?: {
      code?: string;
      memberCount?: number;
      maxParticipants?: number | null;
    },
  ) {
    super(message);
    this.name = 'ActivityApiError';
    this.status = status;
    this.code = details?.code;
    this.memberCount = details?.memberCount;
    this.maxParticipants = details?.maxParticipants;
  }
}

type ActivityErrorPayload = {
  error?: string;
  code?: string;
  memberCount?: number;
  maxParticipants?: number | null;
};

function activityApiError(
  payload: ActivityErrorPayload | null,
  status: number,
  fallback: string,
) {
  return new ActivityApiError(payload?.error ?? fallback, status, {
    code: payload?.code,
    memberCount: payload?.memberCount,
    maxParticipants: payload?.maxParticipants,
  });
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
    | ActivityErrorPayload
    | CreateActivityResponse
    | null;

  if (!response.ok) {
    throw activityApiError(
      payload && 'activity' in payload ? null : payload,
      response.status,
      'The activity could not be published.',
    );
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

export async function getMyCreatedActivities() {
  const response = await fetch('/api/activities/mine', {
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as
    | ActivityErrorPayload
    | MyCreatedActivitiesResponse
    | null;

  if (!response.ok) {
    throw activityApiError(
      payload && 'activities' in payload ? null : payload,
      response.status,
      'The activities could not be loaded.',
    );
  }

  return payload as MyCreatedActivitiesResponse;
}

export async function joinActivity(activityId: string) {
  const response = await fetch(
    `/api/activities/${encodeURIComponent(activityId)}/join`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | ActivityErrorPayload
    | ActivityMembershipResponse
    | null;

  if (!response.ok) {
    throw activityApiError(
      payload,
      response.status,
      'The activity could not be joined.',
    );
  }

  return payload as ActivityMembershipResponse;
}

export async function leaveActivity(activityId: string) {
  const response = await fetch(
    `/api/activities/${encodeURIComponent(activityId)}/membership`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | ActivityErrorPayload
    | ActivityMembershipResponse
    | null;

  if (!response.ok) {
    throw activityApiError(
      payload,
      response.status,
      'The activity could not be left.',
    );
  }

  return payload as ActivityMembershipResponse;
}