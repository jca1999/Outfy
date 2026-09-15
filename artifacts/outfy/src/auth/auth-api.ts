export type DisplayNameVisibility =
  | 'everyone'
  | 'shared_activity'
  | 'friends'
  | 'nobody';

export interface HomeLocation {
  countryCode: string;
  country: string;
  regionCode: string | null;
  region: string | null;
  city: string;
  latitude: number;
  longitude: number;
}

export interface NotificationPreferences {
  activities: boolean;
  connections: boolean;
  messages: boolean;
  reminders: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  displayNameVisibility: DisplayNameVisibility;
  homeCity: string | null;
  homeLocation: HomeLocation | null;
  isProfilePrivate: boolean;
  notificationPreferences: NotificationPreferences;
}

export interface UpdateProfileResponse {
  user: AuthUser;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface AuthMessageResponse {
  message: string;
  email?: string | null;
}

export interface ProfileAvatarResponse {
  avatarUrl: string | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  isPrivate: boolean;
  isOwnProfile: boolean;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
}

export const PROFILE_AVATAR_CHANGED_EVENT = 'outfy:profile-avatar-changed';

export interface ProfileAvatarChangedDetail extends ProfileAvatarResponse {
  action: 'updated' | 'removed';
}

function notifyProfileAvatarChanged(detail: ProfileAvatarChangedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ProfileAvatarChangedDetail>(
      PROFILE_AVATAR_CHANGED_EVENT,
      { detail },
    ),
  );
}

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'No se ha podido completar la solicitud.';
    throw new AuthApiError(message, response.status);
  }

  return payload as T;
}

async function avatarRequest(
  init: RequestInit = {},
): Promise<ProfileAvatarResponse> {
  const response = await fetch('/api/auth/profile/avatar', {
    ...init,
    credentials: 'include',
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | ProfileAvatarResponse
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'No se ha podido completar la solicitud.';
    throw new AuthApiError(message, response.status);
  }

  return payload as ProfileAvatarResponse;
}

export function getSession() {
  return request<AuthSessionResponse>('/session');
}

export function getPublicProfile(username: string) {
  return request<PublicProfileResponse>(
    `/users/${encodeURIComponent(username)}`,
  );
}

export function signIn(input: { username: string; password: string }) {
  return request<AuthSessionResponse>('/sign-in', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function signUp(input: {
  username: string;
  email: string;
  password: string;
  invitationCode: string;
}) {
  return request<AuthMessageResponse>('/sign-up', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function verifyEmail(input: { email: string; token: string }) {
  return request<AuthSessionResponse>('/verify-email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendVerificationCode(input: { email: string }) {
  return request<AuthMessageResponse>('/resend-code', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(input: { email: string }) {
  return request<AuthMessageResponse>('/forgot-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resetPassword(input: {
  tokenHash: string;
  password: string;
}) {
  return request<AuthMessageResponse>('/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProfile(input: {
  displayName?: string;
  displayNameVisibility?: DisplayNameVisibility;
  homeCity?: string;
  homeLocation?: HomeLocation | null;
  isProfilePrivate?: boolean;
  notificationPreferences?: Partial<NotificationPreferences>;
}) {
  return request<UpdateProfileResponse>('/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getProfileAvatar() {
  return avatarRequest();
}

export async function uploadProfileAvatar(avatar: Blob) {
  const result = await avatarRequest({
    method: 'PUT',
    headers: {
      'Content-Type': 'image/webp',
    },
    body: avatar,
  });
  notifyProfileAvatarChanged({ ...result, action: 'updated' });
  return result;
}

export async function deleteProfileAvatar() {
  const result = await avatarRequest({ method: 'DELETE' });
  notifyProfileAvatarChanged({ ...result, action: 'removed' });
  return result;
}

export function signOut() {
  return request<AuthMessageResponse>('/sign-out', { method: 'POST' });
}