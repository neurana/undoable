import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/core/src/storage/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://undoable:undoable_dev@localhost:5432/undoable",
  },
});
