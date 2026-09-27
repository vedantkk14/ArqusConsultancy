import { Role } from './role';

/** Matches the `user` object returned by POST /auth/login and GET /me. */
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}
