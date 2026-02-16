import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const ALGO = "aes-256-gcm";
const AAD = Buffer.from("undoable:providers:apikey:v1", "utf-8");

const DEFAULT_KEY_FILE = path.join(os.homedir(), ".undoable", "secrets.key");

export type SecretKeySource = "env" | "file" | "generated" | "none";

export async function resolveSecretKey(): Promise<{ key: Buffer | null; source: SecretKeySource }> {
  const envKey = parseKey(process.env.UNDOABLE_SECRETS_KEY);
  if (envKey) {
    return { key: envKey, source: "env" };
  }

  const keyFilePath = process.env.UNDOABLE_SECRETS_KEY_FILE
    ? path.resolve(process.env.UNDOABLE_SECRETS_KEY_FILE)
    : DEFAULT_KEY_FILE;

  try {
    const existing = await fsp.readFile(keyFilePath, "utf-8");
    const parsed = parseKey(existing);
    if (parsed) {
      return { key: parsed, source: "file" };
    }
  } catch {
    // missing key file -> generate one below
  }

  try {
    const generated = randomBytes(KEY_BYTES);
    const dir = path.dirname(keyFilePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(keyFilePath, `${generated.toString("base64url")}\n`, { encoding: "utf-8", mode: 0o600 });
    await fsp.chmod(keyFilePath, 0o600).catch(() => {
      // best effort
    });
    return { key: generated, source: "generated" };
  } catch {
    return { key: null, source: "none" };
  }
}

export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(secret, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string, key: Buffer): string | null {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return null;
  }

  const iv = decodeBase64Url(parts[1]);
  const tag = decodeBase64Url(parts[2]);
  const encrypted = decodeBase64Url(parts[3]);
  if (!iv || !tag || !encrypted) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return null;
  }
}

function parseKey(input: string | undefined): Buffer | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parsed = decodeKey(trimmed);
  if (!parsed || parsed.length !== KEY_BYTES) return null;
  return parsed;
}

function decodeKey(value: string): Buffer | null {
  const encodings: Array<BufferEncoding> = ["base64url", "base64", "hex"];
  for (const encoding of encodings) {
    try {
      const decoded = Buffer.from(value, encoding);
      if (decoded.length > 0) return decoded;
    } catch {
      // continue
    }
  }
  return null;
}

function decodeBase64Url(value: string | undefined): Buffer | null {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}
