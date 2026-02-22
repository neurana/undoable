import { defineConfig } from "drizzle-kit";

const defaultDatabaseUrl =
  process.platform === "darwin"
    ? "postgresql://localhost:5432/undoable"
    : "postgresql://undoable:undoable_dev@localhost:5432/undoable";

export default defineConfig({
  schema: "./packages/core/src/storage/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});
