import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const DEFAULT_EXPIRY = "24h";

export type TokenPayload = {
  sub: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
};

export class JwtService {
  private secret: Uint8Array;

  constructor(secret: string) {
    this.secret = new TextEncoder().encode(secret);
  }

  async sign(claims: { sub: string; [key: string]: unknown }, expiresIn: string = DEFAULT_EXPIRY): Promise<string> {
    const { sub, ...rest } = claims;
    return new SignJWT(rest)
      .setProtectedHeader({ alg: ALG })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.secret);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return { sub: payload.sub!, iat: payload.iat!, exp: payload.exp!, ...payload };
    } catch {
      return null;
    }
  }
}
