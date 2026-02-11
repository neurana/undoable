import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AuthUser, TokenPayload } from "./types.js";

const ALG = "HS256";
const DEFAULT_EXPIRY = "24h";

export class JwtService {
  private secret: Uint8Array;

  constructor(secret: string) {
    this.secret = new TextEncoder().encode(secret);
  }

  async sign(user: AuthUser, expiresIn: string = DEFAULT_EXPIRY): Promise<string> {
    return new SignJWT({
      username: user.username,
      role: user.role,
    })
      .setProtectedHeader({ alg: ALG })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.secret);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return this.toTokenPayload(payload);
    } catch {
      return null;
    }
  }

  private toTokenPayload(payload: JWTPayload): TokenPayload {
    return {
      sub: payload.sub!,
      username: payload.username as string,
      role: payload.role as TokenPayload["role"],
      iat: payload.iat!,
      exp: payload.exp!,
    };
  }
}
