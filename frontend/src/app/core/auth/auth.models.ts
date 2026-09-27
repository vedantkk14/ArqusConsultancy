import { User } from '../models';

/** The signed-in user as the auth endpoints return it. */
export interface AuthUser extends User {
  must_change_password?: boolean;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

/** POST /auth/login and POST /auth/password/change. */
export interface AuthResponse extends TokenPair {
  user: AuthUser;
  must_change_password: boolean;
}

/** Error codes the auth endpoints return in {"error": {"code"}} (see docs/API_CONTRACT.md). */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'account_locked'
  | 'too_many_requests'
  | 'token_invalid'
  | 'reset_link_invalid'
  | 'validation_error'
  | 'network_error';
