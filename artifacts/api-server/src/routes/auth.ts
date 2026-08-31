import { Router, type IRouter, type Request, type Response } from "express";
import {
  getSupabaseError,
  supabaseRequest,
  type SupabaseSession,
  type SupabaseUser,
} from "../lib/supabase";

const router: IRouter = Router();
const ACCESS_COOKIE = "outfy_access_token";
const REFRESH_COOKIE = "outfy_refresh_token";
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

interface AuthBody {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  token?: unknown;
}

interface ProfileLookup {
  email?: string;
  username?: string;
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
    isNonEmptyString(value) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function isUsername(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !/\s/.test(value.trim()) &&
    value.trim().length <= 32
  );
}

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

function publicUser(user: SupabaseUser) {
  const username = user.user_metadata?.username;
  return {
    id: user.id,
    username: typeof username === "string" ? username : "usuario",
  };
}

function clearSession(response: Response) {
  response.clearCookie(ACCESS_COOKIE, SESSION_COOKIE_OPTIONS);
  response.clearCookie(REFRESH_COOKIE, SESSION_COOKIE_OPTIONS);
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

function sessionPayload(user: SupabaseUser) {
  return { authenticated: true, user: publicUser(user) };
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
  return refreshed?.user ? { accessToken: refreshed.access_token, user: refreshed.user } : null;
}

async function findProfileByUsername(username: string) {
  const query = `/rest/v1/profiles?select=email,username&username=eq.${encodeURIComponent(username)}&limit=1`;
  return supabaseRequest<ProfileLookup[]>(query);
}

router.get("/auth/session", async (request, response) => {
  try {
    const session = await currentSession(request, response);
    response.json(
      session
        ? sessionPayload(session.user)
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
  const username = isUsername(body.username) ? body.username.trim() : "";
  const password = isNonEmptyString(body.password) ? body.password : "";

  if (!username || !password) {
    sendError(response, 400, "Introduce tu nombre de usuario y contraseña.");
    return;
  }

  try {
    const profileResult = await findProfileByUsername(username);
    if (
      !profileResult.response.ok ||
      !profileResult.data?.[0]?.email ||
      typeof profileResult.data[0].email !== "string"
    ) {
      sendError(response, 400, "No se encontró una cuenta con ese nombre de usuario.");
      return;
    }

    const loginResult = await supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: { email: profileResult.data[0].email, password },
      },
    );

    if (!loginResult.response.ok || !loginResult.data?.user) {
      const providerError = getSupabaseError(
        loginResult.data,
        "El nombre de usuario o la contraseña no son correctos.",
      );
      const message = /confirm|verified/i.test(providerError)
        ? "Confirma tu correo electrónico antes de iniciar sesión."
        : "El nombre de usuario o la contraseña no son correctos.";
      sendError(response, 400, message);
      return;
    }

    setSession(response, loginResult.data);
    response.json(sessionPayload(loginResult.data.user));
  } catch (error) {
    request.log.error({ err: error }, "Supabase sign in failed");
    sendError(response, 502, "No se ha podido conectar con el servicio de acceso.");
  }
});

router.post("/auth/sign-up", async (request, response) => {
  const body = bodyOf(request);
  const username = isUsername(body.username) ? body.username.trim() : "";
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const password = isNonEmptyString(body.password) ? body.password : "";

  if (!username) {
    sendError(response, 400, "El nombre de usuario es obligatorio y no puede contener espacios.");
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

  try {
    const existingProfile = await findProfileByUsername(username);
    if (existingProfile.response.ok && existingProfile.data?.length) {
      sendError(response, 409, "Ese nombre de usuario ya está en uso.");
      return;
    }

    const signupResult = await supabaseRequest<SupabaseSession>(
      "/auth/v1/signup",
      {
        method: "POST",
        body: { email, password, data: { username } },
      },
    );

    if (!signupResult.response.ok || !signupResult.data?.user) {
      const message = getSupabaseError(
        signupResult.data,
        "No se ha podido crear la cuenta.",
      );
      sendError(response, 400, /already|registered|exists/i.test(message)
        ? "Ese correo electrónico ya está registrado."
        : message);
      return;
    }

    if (signupResult.data.access_token) {
      setSession(response, signupResult.data);
    } else {
      clearSession(response);
    }

    response.status(201).json({
      message: "Te hemos enviado un código de verificación.",
      email,
    });
  } catch (error) {
    request.log.error({ err: error }, "Supabase sign up failed");
    sendError(response, 502, "No se ha podido conectar con el servicio de registro.");
  }
});

router.post("/auth/verify-email", async (request, response) => {
  const body = bodyOf(request);
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!email || !/^\d{6}$/.test(token)) {
    sendError(response, 400, "Introduce el código de seis cifras que has recibido.");
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
      sendError(response, 400, /expired|invalid|token/i.test(message)
        ? "El código no es válido o ha caducado."
        : message);
      return;
    }

    setSession(response, verificationResult.data);
    response.json(sessionPayload(verificationResult.data.user));
  } catch (error) {
    request.log.error({ err: error }, "Supabase email verification failed");
    sendError(response, 502, "No se ha podido verificar el correo electrónico.");
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
    const resendResult = await supabaseRequest(
      "/auth/v1/resend",
      { method: "POST", body: { type: "signup", email } },
    );

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