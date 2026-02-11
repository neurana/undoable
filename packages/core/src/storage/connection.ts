import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export function createTestDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 1 });
  return drizzle(client, { schema });
}
