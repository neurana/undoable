import { createDatabase, type Database } from "@undoable/core";

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function initDatabase(connectionString?: string): Database {
  if (db) {
    return db;
  }
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  db = createDatabase(url);
  return db;
}

export function isDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
