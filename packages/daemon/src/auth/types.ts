import type { UserRole } from "./middleware.js";

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; error: string };

export type TokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
};
