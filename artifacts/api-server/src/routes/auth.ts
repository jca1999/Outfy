import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  getSupabaseAdmin,
  getSupabaseAuth,
  getSupabaseErrorCode,
  getSupabaseError,
  supabaseRequest,
  type SupabaseSession,
  type SupabaseUser,
} from "../lib/supabase";

const router: IRouter = Router();
const ACCESS_COOKIE = "outfy_access_token";
const REFRESH_COOKIE = "outfy_refresh_token";
const RECOVERY_COOKIE = "outfy_recovery_token";
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

type DisplayNameVisibility =
  | "everyone"
  | "shared_activity"
  | "friends"
  | "nobody";

type NotificationPreferences = {
  activities: boolean;
  connections: boolean;
  messages: boolean;
  reminders: boolean;
};

function isDisplayNameVisibility(
  value: unknown,
): value is DisplayNameVisibility {
  return (
    value === "everyone" ||
    value === "shared_activity" ||
    value === "friends" ||
    value === "nobody"
  );
}

interface AuthBody {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  token?: unknown;
  tokenHash?: unknown;
  invitationCode?: unknown;
  displayName?: unknown;
  displayNameVisibility?: unknown;
  homeCity?: unknown;
  homeLocation?: unknown;
  isProfilePrivate?: unknown;
  notificationPreferences?: unknown;
}

interface ProfileLookup {
  id?: string;
  email?: string;
  username?: string;
  username_normalized?: string;
  display_name?: string | null;
  display_name_visibility?: DisplayNameVisibility | null;
  home_city?: string | null;
  home_country_code?: string | null;
  home_country?: string | null;
  home_region_code?: string | null;
  home_region?: string | null;
  home_latitude?: number | null;
  home_longitude?: number | null;
  is_profile_private?: boolean | null;
  notify_activities?: boolean | null;
  notify_connections?: boolean | null;
  notify_messages?: boolean | null;
  notify_reminders?: boolean | null;
}

interface HomeLocation {
  countryCode: string;
  country: string;
  regionCode: string | null;
  region: string | null;
  city: string;
  latitude: number;
  longitude: number;
}

function bodyOf(request: Request): AuthBody {
  return request.body && typeof request.body === "object"
    ? (request.body as AuthBody)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmail(value: unknown): value is string {
  return (
    isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function isUsername(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !/\s/.test(value.trim()) &&
    value.trim().length <= 32
  );
}

function parseHomeLocation(value: unknown): HomeLocation | null | undefined {
  if (value === null) {
    return null;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const location = value as Record<string, unknown>;
  const countryCode =
    typeof location.countryCode === "string"
      ? location.countryCode.trim().toUpperCase()
      : "";
  const country =
    typeof location.country === "string" ? location.country.trim() : "";
  const city = typeof location.city === "string" ? location.city.trim() : "";
  const regionCode =
    location.regionCode === undefined || location.regionCode === null
      ? null
      : typeof location.regionCode === "string"
        ? location.regionCode.trim() || null
        : undefined;
  const region =
    location.region === undefined || location.region === null
      ? null
      : typeof location.region === "string"
        ? location.region.trim() || null
        : undefined;
  const latitude = location.latitude;
  const longitude = location.longitude;

  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    !country ||
    !city ||
    regionCode === undefined ||
    region === undefined ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }

  return {
    countryCode,
    country,
    regionCode,
    region,
    city,
    latitude,
    longitude,
  };
}

function profileHomeLocation(
  profile: ProfileLookup | undefined,
): HomeLocation | null {
  if (!profile) {
    return null;
  }

  return (
    parseHomeLocation({
      countryCode: profile.home_country_code,
      country: profile.home_country,
      regionCode: profile.home_region_code,
      region: profile.home_region,
      city: profile.home_city,
      latitude: profile.home_latitude,
      longitude: profile.home_longitude,
    }) ?? null
  );
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function invitationCodeHash(code: string) {
  return createHash("sha256")
    .update(code.trim().toUpperCase(), "utf8")
    .digest("hex");
}

type InvitationDecision = {
  accepted: boolean;
  reason: "accepted" | "invalid" | "inactive" | "expired" | "exhausted";
};

type SupabaseSignupResponse = SupabaseSession | SupabaseUser;

function isSupabaseUser(value: unknown): value is SupabaseUser {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string",
  );
}

function isSupabaseSession(value: unknown): value is SupabaseSession {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { access_token?: unknown }).access_token === "string" &&
      typeof (value as { refresh_token?: unknown }).refresh_token ===
        "string" &&
      isSupabaseUser((value as { user?: unknown }).user),
  );
}

async function validateInvitationCode(code: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "validate_invitation_code",
    {
      input_code_hash: invitationCodeHash(code),
    },
  );

  return {
    data: data as InvitationDecision[] | null,
    error,
  };
}

async function consumeInvitationCode(code: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "consume_invitation_code",
    {
      input_code_hash: invitationCodeHash(code),
    },
  );

  return {
    data: data as InvitationDecision[] | null,
    error,
  };
}

async function rollbackSignupUser(
  request: Request,
  response: Response,
  userId: string,
) {
  clearSession(response);

  try {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
    if (error) {
      request.log.error(
        { err: error, userId },
        "Failed to roll back signup after invitation consumption failure",
      );
      return false;
    }
    return true;
  } catch (error) {
    request.log.error(
      { err: error, userId },
      "Failed to roll back signup after invitation consumption failure",
    );
    return false;
  }
}

function clearRecoverySession(response: Response) {
  response.clearCookie(RECOVERY_COOKIE, SESSION_COOKIE_OPTIONS);
}

function setRecoverySession(response: Response, accessToken: string) {
  response.cookie(RECOVERY_COOKIE, accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 1000 * 60 * 15,
  });
}

function invitationError(reason: InvitationDecision["reason"]) {
  switch (reason) {
    case "inactive":
      return "Este código de invitación ya no está activo.";
    case "expired":
      return "Este código de invitación ha caducado.";
    case "exhausted":
      return "Este código de invitación ya ha alcanzado su límite de usos.";
    default:
      return "El código de invitación no es válido.";
  }
}

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

function profileNotificationPreferences(
  profile?: ProfileLookup,
): NotificationPreferences {
  return {
    activities:
      profile?.notify_activities !== false,
    connections:
      profile?.notify_connections !== false,
    messages:
      profile?.notify_messages !== false,
    reminders:
      profile?.notify_reminders !== false,
  };
}

function publicUser(
  user: SupabaseUser,
  displayUsername?: string,
  displayName?: string | null,
  displayNameVisibility: DisplayNameVisibility = "shared_activity",
  homeCity?: string | null,
  homeLocation: HomeLocation | null = null,
  isProfilePrivate = false,
  notificationPreferences: NotificationPreferences = {
    activities: true,
    connections: true,
    messages: true,
    reminders: true,
  },
) {
  const username = user.user_metadata?.username;

  return {
    id: user.id,
    username:
      displayUsername ?? (typeof username === "string" ? username : "usuario"),
    displayName:
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : null,
    displayNameVisibility,
    homeCity:
      typeof homeCity === "string" && homeCity.trim() ? homeCity.trim() : null,
    homeLocation,
    isProfilePrivate,
    notificationPreferences,
  };
}

function clearSession(response: Response) {
  response.clearCookie(ACCESS_COOKIE, SESSION_COOKIE_OPTIONS);
  response.clearCookie(REFRESH_COOKIE, SESSION_COOKIE_OPTIONS);
}

function passwordRecoveryRedirectUrl(request: Request) {
  const configuredUrl = process.env["APP_URL"]?.trim();

  if (configuredUrl) {
    return new URL("/reset-password", configuredUrl).toString();
  }

  const origin = request.get("origin");

  if (origin) {
    try {
      return new URL("/reset-password", origin).toString();
    } catch {
      // Continúa con el fallback.
    }
  }

  const host = request.get("host");

  if (!host) {
    throw new Error("Unable to determine application URL.");
  }

  return `${request.protocol}://${host}/reset-password`;
}

function setSession(response: Response, session: SupabaseSession) {
  response.cookie(ACCESS_COOKIE, session.access_token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: Math.max(60, (session.expires_in ?? 3600) - 30) * 1000,
  });
  response.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

async function sessionPayload(user: SupabaseUser) {
  const profileResult = await findProfileByUserId(user.id);
  const profile = !profileResult.error ? profileResult.data?.[0] : undefined;

  const displayUsername =
    typeof profile?.username === "string" ? profile.username : undefined;

  const displayName =
    typeof profile?.display_name === "string" ? profile.display_name : null;

  const displayNameVisibility = isDisplayNameVisibility(
    profile?.display_name_visibility,
  )
    ? profile.display_name_visibility
    : "shared_activity";

  const homeCity =
    typeof profile?.home_city === "string" ? profile.home_city : null;

  const isProfilePrivate = profile?.is_profile_private === true;

  const notificationPreferences =
    profileNotificationPreferences(profile);

  return {
    authenticated: true,
    user: publicUser(
      user,
      displayUsername,
      displayName,
      displayNameVisibility,
      homeCity,
      null,
      isProfilePrivate,
      notificationPreferences,
    ),
  };
}

async function refreshSession(request: Request, response: Response) {
  const refreshToken = request.cookies?.[REFRESH_COOKIE];
  if (!isNonEmptyString(refreshToken)) return null;

  const result = await supabaseRequest<SupabaseSession>(
    "/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: { refresh_token: refreshToken } },
  );

  if (!result.response.ok || !result.data?.access_token) {
    clearSession(response);
    return null;
  }

  setSession(response, result.data);
  return result.data;
}

async function currentSession(request: Request, response: Response) {
  const accessToken = request.cookies?.[ACCESS_COOKIE];
  if (isNonEmptyString(accessToken)) {
    const result = await supabaseRequest<SupabaseUser>("/auth/v1/user", {
      authorization: `Bearer ${accessToken}`,
    });

    if (result.response.ok && result.data?.id) {
      return { accessToken, user: result.data };
    }
  }

  const refreshed = await refreshSession(request, response);
  return refreshed?.user
    ? { accessToken: refreshed.access_token, user: refreshed.user }
    : null;
}

async function findProfileByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("id,email,username,display_name,display_name_visibility,home_city")
    .eq("username_normalized", normalizedUsername)
    .limit(1);

  return {
    data: data as ProfileLookup[] | null,
    error,
  };
}

async function findProfileByUserId(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select(
      "id,username,display_name,display_name_visibility,home_city,is_profile_private,notify_activities,notify_connections,notify_messages,notify_reminders",
    )
    .eq("id", userId)
    .limit(1);

  return {
    data: data as ProfileLookup[] | null,
    error,
  };
}

router.get("/auth/session", async (request, response) => {
  try {
    const session = await currentSession(request, response);
    response.json(
      session
        ? await sessionPayload(session.user)
        : { authenticated: false, user: null },
    );
  } catch (error) {
    request.log.error({ err: error }, "Unable to read Supabase session");
    clearSession(response);
    response.json({ authenticated: false, user: null });
  }
});

router.post("/auth/sign-in", async (request, response) => {
  const body = bodyOf(request);

  const identifier = isNonEmptyString(body.username)
    ? body.username.trim()
    : "";

  const password = isNonEmptyString(body.password) ? body.password : "";

  if (!identifier || !password) {
    sendError(
      response,
      400,
      "Introduce tu nombre de usuario o correo y contraseña.",
    );
    return;
  }

  try {
    let loginEmail = "";

    if (isEmail(identifier)) {
      loginEmail = identifier.toLowerCase();
    } else if (isUsername(identifier)) {
      const profileResult = await findProfileByUsername(identifier);

      if (
        profileResult.error ||
        !profileResult.data?.[0]?.email ||
        typeof profileResult.data[0].email !== "string"
      ) {
        sendError(
          response,
          400,
          "El usuario, correo o contraseña no son correctos.",
        );
        return;
      }

      loginEmail = profileResult.data[0].email.trim().toLowerCase();
    } else {
      sendError(
        response,
        400,
        "El usuario, correo o contraseña no son correctos.",
      );
      return;
    }

    const loginResult = await supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: {
          email: loginEmail,
          password,
        },
      },
    );

    if (!loginResult.response.ok || !loginResult.data?.user) {
      const providerError = getSupabaseError(
        loginResult.data,
        "El usuario, correo o contraseña no son correctos.",
      );

      const message = /confirm|verified/i.test(providerError)
        ? "Confirma tu correo electrónico antes de iniciar sesión."
        : "El usuario, correo o contraseña no son correctos.";

      sendError(response, 400, message);
      return;
    }

    setSession(response, loginResult.data);

    response.json(await sessionPayload(loginResult.data.user));
  } catch (error) {
    request.log.error({ err: error }, "Supabase sign in failed");

    sendError(
      response,
      502,
      "No se ha podido conectar con el servicio de acceso.",
    );
  }
});

router.post("/auth/sign-up", async (request, response) => {
  const body = bodyOf(request);
  const username = isUsername(body.username) ? body.username.trim() : "";
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const password = isNonEmptyString(body.password) ? body.password : "";
  const invitationCode = isNonEmptyString(body.invitationCode)
    ? body.invitationCode.trim()
    : "";

  if (!username) {
    sendError(
      response,
      400,
      "El nombre de usuario es obligatorio y no puede contener espacios.",
    );
    return;
  }
  if (!email) {
    sendError(response, 400, "Introduce un correo electrónico válido.");
    return;
  }
  if (password.length < 8) {
    sendError(response, 400, "La contraseña debe tener al menos 8 caracteres.");
    return;
  }
  if (!invitationCode || invitationCode.length > 128) {
    sendError(response, 400, "Introduce un código de invitación válido.");
    return;
  }

  try {
    const existingProfile = await findProfileByUsername(username);
    if (existingProfile.error) {
      request.log.error(
        { code: existingProfile.error.code },
        "Privileged username lookup failed",
      );
      sendError(
        response,
        503,
        "El acceso privado no está disponible ahora. Inténtalo de nuevo más tarde.",
      );
      return;
    }
    if (existingProfile.data?.length) {
      sendError(response, 409, "Este nombre de usuario ya está en uso");
      return;
    }

    const invitationResult = await validateInvitationCode(invitationCode);
    if (invitationResult.error || !invitationResult.data?.[0]) {
      request.log.error(
        { code: invitationResult.error?.code },
        "Privileged invitation validation failed",
      );
      sendError(
        response,
        503,
        "El acceso privado no está disponible ahora. Inténtalo de nuevo más tarde.",
      );
      return;
    }

    const invitation = invitationResult.data[0];
    if (!invitation.accepted) {
      sendError(response, 400, invitationError(invitation.reason));
      return;
    }

    let signupUserId: string;
    const signupResult = await supabaseRequest<SupabaseSignupResponse>(
      "/auth/v1/signup",
      {
        method: "POST",
        body: { email, password, data: { username } },
      },
    );
    const signupData = signupResult.data;
    const signupUser = isSupabaseSession(signupData)
      ? signupData.user
      : isSupabaseUser(signupData)
        ? signupData
        : null;

    if (!signupResult.response.ok || !signupUser) {
      const profileAfterSignup = await findProfileByUsername(username);
      if (!profileAfterSignup.error && profileAfterSignup.data?.length) {
        sendError(response, 409, "Este nombre de usuario ya está en uso");
        return;
      }

      const providerError = getSupabaseError(signupResult.data, "");
      request.log.warn(
        {
          status: signupResult.response.status,
          code: getSupabaseErrorCode(signupResult.data),
          message: providerError || undefined,
        },
        "Supabase signup rejected",
      );
      sendError(
        response,
        400,
        /already|registered|exists/i.test(providerError)
          ? "Ese correo electrónico ya está registrado."
          : "No se ha podido crear la cuenta.",
      );
      return;
    }

    signupUserId = signupUser.id;

    let invitationConsumption;
    try {
      invitationConsumption = await consumeInvitationCode(invitationCode);
    } catch (error) {
      request.log.error(
        { err: error, userId: signupUserId },
        "Invitation consumption failed after signup",
      );
      await rollbackSignupUser(request, response, signupUserId);
      sendError(
        response,
        503,
        "No se ha podido completar el registro. Inténtalo de nuevo más tarde.",
      );
      return;
    }

    if (invitationConsumption.error || !invitationConsumption.data?.[0]) {
      request.log.error(
        {
          code: invitationConsumption.error?.code,
          userId: signupUserId,
        },
        "Privileged invitation consumption failed after signup",
      );
      await rollbackSignupUser(request, response, signupUserId);
      sendError(
        response,
        503,
        "No se ha podido completar el registro. Inténtalo de nuevo más tarde.",
      );
      return;
    }

    const consumedInvitation = invitationConsumption.data[0];
    if (!consumedInvitation.accepted) {
      request.log.warn(
        {
          reason: consumedInvitation.reason,
          userId: signupUserId,
        },
        "Invitation became unusable before consumption",
      );
      const rollbackSucceeded = await rollbackSignupUser(
        request,
        response,
        signupUserId,
      );
      sendError(
        response,
        rollbackSucceeded ? 400 : 503,
        rollbackSucceeded
          ? invitationError(consumedInvitation.reason)
          : "No se ha podido completar el registro. Inténtalo de nuevo más tarde.",
      );
      return;
    }

    if (isSupabaseSession(signupData)) {
      setSession(response, signupData);
    } else {
      clearSession(response);
    }

    response.status(201).json({
      message: "Te hemos enviado un código de verificación.",
      email,
    });
  } catch (error) {
    request.log.error({ err: error }, "Supabase sign up failed");
    sendError(
      response,
      502,
      "No se ha podido conectar con el servicio de registro.",
    );
  }
});

router.post("/auth/verify-email", async (request, response) => {
  const body = bodyOf(request);
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!email || !/^\d{6}$/.test(token)) {
    sendError(
      response,
      400,
      "Introduce el código de seis cifras que has recibido.",
    );
    return;
  }

  try {
    const verificationResult = await supabaseRequest<SupabaseSession>(
      "/auth/v1/verify",
      { method: "POST", body: { type: "signup", token, email } },
    );

    if (!verificationResult.response.ok || !verificationResult.data?.user) {
      const message = getSupabaseError(
        verificationResult.data,
        "El código no es válido o ha caducado.",
      );
      sendError(
        response,
        400,
        /expired|invalid|token/i.test(message)
          ? "El código no es válido o ha caducado."
          : message,
      );
      return;
    }

    setSession(response, verificationResult.data);
    response.json(await sessionPayload(verificationResult.data.user));
  } catch (error) {
    request.log.error({ err: error }, "Supabase email verification failed");
    sendError(
      response,
      502,
      "No se ha podido verificar el correo electrónico.",
    );
  }
});

router.post("/auth/resend-code", async (request, response) => {
  const body = bodyOf(request);
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";

  if (!email) {
    sendError(response, 400, "Introduce un correo electrónico válido.");
    return;
  }

  try {
    const resendResult = await supabaseRequest("/auth/v1/resend", {
      method: "POST",
      body: { type: "signup", email },
    });

    if (!resendResult.response.ok) {
      sendError(response, 400, "No se ha podido reenviar el código.");
      return;
    }

    response.json({ message: "Te hemos enviado un nuevo código.", email });
  } catch (error) {
    request.log.error({ err: error }, "Supabase verification resend failed");
    sendError(response, 502, "No se ha podido reenviar el código.");
  }
});

router.post("/auth/forgot-password", async (request, response) => {
  const body = bodyOf(request);
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";

  if (!email) {
    sendError(response, 400, "Introduce un correo electrónico válido.");
    return;
  }

  try {
    const redirectTo = passwordRecoveryRedirectUrl(request);

    const { error } = await getSupabaseAuth().auth.resetPasswordForEmail(
      email,
      {
        redirectTo,
      },
    );

    if (error) {
      request.log.warn(
        {
          status: error.status,
          message: error.message,
        },
        "Supabase password recovery email failed",
      );

      if (error.status === 429) {
        sendError(
          response,
          429,
          "Has solicitado demasiados enlaces. Espera un poco antes de intentarlo de nuevo.",
        );
        return;
      }

      sendError(
        response,
        502,
        "No se ha podido enviar el correo de recuperación.",
      );
      return;
    }

    response.json({
      message:
        "Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer tu contraseña.",
    });
  } catch (error) {
    request.log.error({ err: error }, "Password recovery request failed");

    sendError(
      response,
      502,
      "No se ha podido enviar el correo de recuperación.",
    );
  }
});

router.post("/auth/reset-password", async (request, response) => {
  const body = bodyOf(request);

  const tokenHash = isNonEmptyString(body.tokenHash)
    ? body.tokenHash.trim()
    : "";

  const password = isNonEmptyString(body.password) ? body.password : "";

  if (password.length < 8) {
    sendError(response, 400, "La contraseña debe tener al menos 8 caracteres.");
    return;
  }

  try {
    let recoveryAccessToken = request.cookies?.[RECOVERY_COOKIE];

    if (!isNonEmptyString(recoveryAccessToken)) {
      if (!tokenHash) {
        sendError(
          response,
          400,
          "El enlace de recuperación no es válido o ha caducado.",
        );
        return;
      }

      const verificationResult = await supabaseRequest<SupabaseSession>(
        "/auth/v1/verify",
        {
          method: "POST",
          body: {
            type: "recovery",
            token_hash: tokenHash,
          },
        },
      );

      if (
        !verificationResult.response.ok ||
        !verificationResult.data?.access_token
      ) {
        clearRecoverySession(response);

        sendError(
          response,
          400,
          "El enlace de recuperación no es válido o ha caducado.",
        );
        return;
      }

      recoveryAccessToken = verificationResult.data.access_token;

      setRecoverySession(response, recoveryAccessToken);
    }

    const updateResult = await supabaseRequest<SupabaseUser>("/auth/v1/user", {
      method: "PUT",
      authorization: `Bearer ${recoveryAccessToken}`,
      body: {
        password,
      },
    });

    if (!updateResult.response.ok || !updateResult.data?.id) {
      const errorCode = getSupabaseErrorCode(updateResult.data);

      request.log.warn(
        {
          status: updateResult.response.status,
          code: errorCode,
        },
        "Supabase password update rejected",
      );

      if (errorCode === "same_password") {
        sendError(
          response,
          400,
          "La nueva contraseña no puede ser igual a la contraseña actual. Elige una diferente.",
        );
        return;
      }

      if (errorCode === "weak_password") {
        sendError(
          response,
          400,
          "La contraseña no cumple los requisitos de seguridad. Elige una contraseña más segura.",
        );
        return;
      }

      sendError(response, 400, "No se ha podido guardar la nueva contraseña.");
      return;
    }

    try {
      await supabaseRequest("/auth/v1/logout", {
        method: "POST",
        authorization: `Bearer ${recoveryAccessToken}`,
      });
    } catch {
      // La contraseña ya ha sido actualizada correctamente.
    }

    clearRecoverySession(response);
    clearSession(response);

    response.json({
      message: "Tu contraseña se ha actualizado correctamente.",
    });
  } catch (error) {
    request.log.error({ err: error }, "Password reset failed");

    clearRecoverySession(response);

    sendError(response, 502, "No se ha podido cambiar la contraseña.");
  }
});

router.patch("/auth/profile", async (request, response) => {
  const body = bodyOf(request);

  const hasDisplayName = Object.prototype.hasOwnProperty.call(
    body,
    "displayName",
  );

  const hasDisplayNameVisibility = Object.prototype.hasOwnProperty.call(
    body,
    "displayNameVisibility",
  );

  const hasHomeCity = Object.prototype.hasOwnProperty.call(body, "homeCity");

  const hasProfilePrivacy = Object.prototype.hasOwnProperty.call(
    body,
    "isProfilePrivate",
  );

  const hasNotificationPreferences =
    Object.prototype.hasOwnProperty.call(
      body,
      "notificationPreferences",
    );

  if (
    !hasDisplayName &&
    !hasDisplayNameVisibility &&
    !hasHomeCity &&
    !hasProfilePrivacy &&
    !hasNotificationPreferences
  ) {
    sendError(response, 400, "No se ha indicado ningún cambio.");
    return;
  }

  const updates: {
    display_name?: string | null;
    display_name_visibility?: DisplayNameVisibility;
    home_city?: string | null;
    is_profile_private?: boolean;
    notify_activities?: boolean;
    notify_connections?: boolean;
    notify_messages?: boolean;
    notify_reminders?: boolean;
  } = {};

  if (hasDisplayName) {
    if (typeof body.displayName !== "string") {
      sendError(response, 400, "El nombre no es válido.");
      return;
    }

    const displayName = body.displayName.trim();

    if (displayName.length > 60) {
      sendError(response, 400, "El nombre no puede superar los 60 caracteres.");
      return;
    }

    updates.display_name = displayName || null;
  }

  if (hasDisplayNameVisibility) {
    if (!isDisplayNameVisibility(body.displayNameVisibility)) {
      sendError(response, 400, "La configuración de privacidad no es válida.");
      return;
    }

    updates.display_name_visibility = body.displayNameVisibility;
  }

  if (hasHomeCity) {
    if (typeof body.homeCity !== "string") {
      sendError(response, 400, "La ubicación no es válida.");
      return;
    }

    const homeCity = body.homeCity.trim();

    if (homeCity.length > 80) {
      sendError(
        response,
        400,
        "La ubicación no puede superar los 80 caracteres.",
      );
      return;
    }

    updates.home_city = homeCity || null;
  }

  if (hasProfilePrivacy) {
    if (typeof body.isProfilePrivate !== "boolean") {
      sendError(response, 400, "La privacidad del perfil no es válida.");
      return;
    }

    updates.is_profile_private = body.isProfilePrivate;
  }

  if (hasNotificationPreferences) {
    const preferences =
      body.notificationPreferences;

    if (
      !preferences ||
      typeof preferences !== "object" ||
      Array.isArray(preferences)
    ) {
      sendError(
        response,
        400,
        "Las preferencias de notificaciones no son válidas.",
      );
      return;
    }

    const values =
      preferences as Record<string, unknown>;

    const allowedKeys = [
      "activities",
      "connections",
      "messages",
      "reminders",
    ];

    if (
      Object.keys(values).some(
        (key) => !allowedKeys.includes(key),
      )
    ) {
      sendError(
        response,
        400,
        "Las preferencias de notificaciones no son válidas.",
      );
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        values,
        "activities",
      )
    ) {
      if (
        typeof values.activities !==
        "boolean"
      ) {
        sendError(
          response,
          400,
          "Las preferencias de notificaciones no son válidas.",
        );
        return;
      }

      updates.notify_activities =
        values.activities;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        values,
        "connections",
      )
    ) {
      if (
        typeof values.connections !==
        "boolean"
      ) {
        sendError(
          response,
          400,
          "Las preferencias de notificaciones no son válidas.",
        );
        return;
      }

      updates.notify_connections =
        values.connections;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        values,
        "messages",
      )
    ) {
      if (
        typeof values.messages !==
        "boolean"
      ) {
        sendError(
          response,
          400,
          "Las preferencias de notificaciones no son válidas.",
        );
        return;
      }

      updates.notify_messages =
        values.messages;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        values,
        "reminders",
      )
    ) {
      if (
        typeof values.reminders !==
        "boolean"
      ) {
        sendError(
          response,
          400,
          "Las preferencias de notificaciones no son válidas.",
        );
        return;
      }

      updates.notify_reminders =
        values.reminders;
    }
  }
  
  try {
    const session = await currentSession(request, response);

    if (!session) {
      sendError(response, 401, "Debes iniciar sesión.");
      return;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id)
      .select(
        "id,username,display_name,display_name_visibility,home_city,is_profile_private,notify_activities,notify_connections,notify_messages,notify_reminders",
      )
      .limit(1);

    if (error || !data?.[0]) {
      request.log.error(
        {
          err: error,
          userId: session.user.id,
        },
        "Unable to update profile",
      );

      sendError(response, 500, "No se ha podido actualizar el perfil.");
      return;
    }

    const profile = data[0];

    response.json({
      user: publicUser(
        session.user,
        typeof profile.username === "string" ? profile.username : undefined,
        typeof profile.display_name === "string" ? profile.display_name : null,
        isDisplayNameVisibility(profile.display_name_visibility)
          ? profile.display_name_visibility
          : "shared_activity",

        typeof profile.home_city === "string" ? profile.home_city : null,
        null,
        profile.is_profile_private === true,
        profileNotificationPreferences(
          profile as ProfileLookup,
        ),
      ),
    });
  } catch (error) {
    request.log.error({ err: error }, "Profile update failed");

    sendError(response, 500, "No se ha podido actualizar el perfil.");
  }
});

router.post("/auth/sign-out", async (request, response) => {
  try {
    const accessToken = request.cookies?.[ACCESS_COOKIE];
    if (isNonEmptyString(accessToken)) {
      await supabaseRequest("/auth/v1/logout", {
        method: "POST",
        authorization: `Bearer ${accessToken}`,
      });
    }
  } catch (error) {
    request.log.warn({ err: error }, "Supabase sign out request failed");
  } finally {
    clearSession(response);
  }

  response.json({ message: "Sesión cerrada." });
});

export default router;
