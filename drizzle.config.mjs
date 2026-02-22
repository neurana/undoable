import { defineConfig } from "drizzle-kit";

const defaultDatabaseUrl =
  "postgresql://undoable:undoable_dev@localhost:5432/undoable";

function hasExplicitUsername(connectionString) {
  try {
    const parsed = new URL(connectionString);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return false;
    }
    return parsed.username.length > 0;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(rawValue) {
  const trimmed = rawValue?.trim();
  if (!trimmed) return defaultDatabaseUrl;
  if (hasExplicitUsername(trimmed)) return trimmed;
  return defaultDatabaseUrl;
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

if (process.env.DATABASE_URL && databaseUrl !== process.env.DATABASE_URL.trim()) {
  console.warn(
    "[drizzle] Ignoring DATABASE_URL without explicit username. Falling back to installer default credentials.",
  );
}

export default defineConfig({
  schema: "./packages/core/src/storage/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});