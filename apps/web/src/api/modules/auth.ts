/**
 * Auth module API client.
 * Provides typed methods for authentication endpoints.
 */
import axios from 'axios';
import { z, ZodError } from 'zod';
import type { ApiClient } from '../client';
import type { User, LoginInput, RegisterInput } from '@alsaqi/shared';

// ─── Auth Error Mapping ─────────────────────────────────────────────────────────

/**
 * Stable, message-independent classification of an authentication error.
 *
 * The UI maps each {@link AuthErrorCode} to a localized message via the i18n
 * catalog, so server wording can change without breaking error handling.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_locked'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'response_schema_mismatch'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
}

/**
 * Map a recognized server `error.code` (from the API error envelope) to a
 * stable {@link AuthErrorCode}. Codes mirror `@alsaqi/shared`'s `ErrorCodes`
 * plus auth-specific codes the login endpoint may emit. This never inspects
 * human-readable message text.
 */
const SERVER_CODE_TO_AUTH_CODE: Record<string, AuthErrorCode> = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  UNAUTHORIZED: 'invalid_credentials',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_DISABLED: 'account_locked',
  ACCOUNT_SUSPENDED: 'account_locked',
  RATE_LIMIT_EXCEEDED: 'rate_limited',
  INTERNAL_ERROR: 'server_error',
  DATABASE_ERROR: 'server_error',
  // CSRF validation failure on login means the backend hasn't exempted the
  // login endpoint from CSRF middleware — surface as a generic server error
  // rather than leaking the raw "CSRF token missing" message to the user.
  CSRF_VALIDATION_FAILED: 'server_error',
  FORBIDDEN: 'server_error',
};

/**
 * Map an HTTP status code to a stable {@link AuthErrorCode}. Used as a fallback
 * when the server `error.code` is absent or unrecognized.
 */
function statusToAuthCode(status: number): AuthErrorCode {
  if (status === 401) return 'invalid_credentials';
  if (status === 423) return 'account_locked';
  if (status === 429) return 'rate_limited';
  // 403 on the login endpoint means CSRF wasn't exempted on the backend — treat
  // as a transient server error rather than exposing the raw CSRF message.
  if (status === 403) return 'server_error';
  if (status >= 500 && status < 600) return 'server_error';
  return 'unknown';
}

/**
 * Extract the server-provided `error.code` string from an Axios error's
 * response body. Tolerates the standard error envelope
 * (`{ error: { code } }`) and a flat `{ code }` shape without throwing.
 */
function extractServerErrorCode(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;

  const envelope = data as { error?: unknown; code?: unknown };

  if (
    typeof envelope.error === 'object' &&
    envelope.error !== null &&
    typeof (envelope.error as { code?: unknown }).code === 'string'
  ) {
    return (envelope.error as { code: string }).code;
  }

  if (typeof envelope.code === 'string') {
    return envelope.code;
  }

  return undefined;
}

/**
 * Map an authentication error to a stable {@link AuthErrorCode} using only the
 * HTTP status and the server-provided `error.code`. This function is total: it
 * always returns a defined code, and it never branches on server message text,
 * so two errors with the same status and same server code always map to the
 * same {@link AuthErrorCode} regardless of their message.
 *
 * @param error - The unknown error thrown by the API client (typically an Axios error).
 */
export function mapAuthError(error: unknown): AuthError {
  // Detect schema validation failure: the server responded successfully but its
  // payload doesn't match the expected Zod schema. This is a developer/infra
  // issue, not a credentials problem — surface a distinct code so the UI can
  // show an appropriate message instead of the misleading "login failed".
  if (error instanceof ZodError) {
    console.error(
      '[Auth] Login response failed schema validation — server response shape does not match expected schema.',
      error.issues
    );
    return { code: 'response_schema_mismatch' };
  }

  if (!axios.isAxiosError(error)) {
    return { code: 'unknown' };
  }

  // No response means the request never completed (DNS, offline, timeout, etc.).
  if (!error.response) {
    return { code: 'network_error' };
  }

  const serverCode = extractServerErrorCode(error.response.data);
  if (serverCode) {
    const mapped = SERVER_CODE_TO_AUTH_CODE[serverCode];
    if (mapped) {
      return { code: mapped };
    }
  }

  return { code: statusToAuthCode(error.response.status) };
}

// ─── Response Schemas ─────────────────────────────────────────────────────────

export const UserSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    username: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    department: z.string().nullable(),
    job_title: z.string().optional(),
    role: z.string(),
    profile_picture: z.string().optional(),
    status: z.string(),
    last_login: z.string().optional(),
    theme: z.enum(['light', 'dark']).optional(),
    permissions: z
      .array(z.object({ module: z.string(), action: z.string() }))
      .optional(),
  })
  // Reject any user object that carries credential data: `.strict()` causes
  // validation to fail when unknown keys (including `password`) are present,
  // so credentials are never silently passed through on user objects.
  .strict();

/**
 * User shape as returned inside a login response.
 *
 * Unlike {@link UserSchema} (which is `.strict()` and used for profile/registration
 * payloads), the login endpoint additionally returns transient session-status
 * flags such as `requires_password_change`. This schema therefore allows those
 * extra fields via `.passthrough()`, but still refuses any object carrying a
 * `password` field so credential data is never accepted on a user object
 * (consistent with Requirement 26).
 */
const LoginUserSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    username: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    department: z.string().nullable(),
    job_title: z.string().optional(),
    role: z.string(),
    profile_picture: z.string().optional(),
    status: z.string(),
    last_login: z.string().optional(),
    theme: z.enum(['light', 'dark']).optional(),
    requires_password_change: z.boolean().optional(),
    permissions: z
      .array(z.object({ module: z.string(), action: z.string() }))
      .optional(),
  })
  .passthrough()
  .refine((u) => !('password' in (u as Record<string, unknown>)), {
    message: 'Login user object must not contain a password field',
  });

/**
 * Login response schema.
 *
 * The `/auth/login` endpoint has more than one success shape: a normal login
 * resolves with a user and a session token, a password-change-required login
 * resolves with a user flagged `requires_password_change`, and a 2FA-gated login
 * resolves with `requires2FA` + a `tempToken` (and no user yet). All fields are
 * therefore optional, and unknown fields are preserved via `.passthrough()` so a
 * single caller (`Login.tsx`) can branch on the shape it receives.
 */
const LoginResponseSchema = z
  .object({
    user: LoginUserSchema.optional(),
    token: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    requires2FA: z.boolean().optional(),
    requires2FASetup: z.boolean().optional(),
    tempToken: z.string().optional(),
  })
  .passthrough();

const RegisterResponseSchema = z.object({
  user: UserSchema,
});

const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

const ChangePasswordResponseSchema = z.object({
  success: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The possible success payloads of `POST /auth/login`.
 *
 * - Normal login: `{ user, token }`.
 * - Password-change-required: `{ user, token }` where `user.requires_password_change` is true.
 * - 2FA-gated login: `{ requires2FA: true, tempToken }` (no `user` yet).
 *
 * `accessToken`/`refreshToken` are accepted for forward compatibility. Callers
 * branch on the fields present rather than assuming a single fixed shape.
 */
export interface LoginResponse {
  user?: User & { requires_password_change?: boolean };
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  requires2FA?: boolean;
  requires2FASetup?: boolean;
  tempToken?: string;
}

export interface AuthApi {
  login(data: LoginInput): Promise<LoginResponse>;
  logout(): Promise<{ success: boolean }>;
  refresh(data: { refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken: string;
  }>;
  register(data: RegisterInput): Promise<{ user: User }>;
  changePassword(data: { newPassword: string }): Promise<{ success: boolean }>;
  getCurrentUser(): Promise<User | null>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    login(data) {
      return client.post('/auth/login', LoginResponseSchema, data) as Promise<LoginResponse>;
    },

    logout() {
      return client.post('/auth/logout', LogoutResponseSchema);
    },

    refresh(data) {
      return client.post('/auth/refresh', RefreshResponseSchema, data);
    },

    register(data) {
      return client.post('/auth/register', RegisterResponseSchema, data) as Promise<{
        user: User;
      }>;
    },

    changePassword(data) {
      return client.post('/auth/change-password', ChangePasswordResponseSchema, data);
    },

    async getCurrentUser() {
      try {
        const response = await client.get('/auth/me', z.object({ user: UserSchema }));
        return response.user as User;
      } catch {
        return null;
      }
    },
  };
}
