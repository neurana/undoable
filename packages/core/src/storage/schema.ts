import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigserial,
  jsonb,
  bigint,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  role: varchar("role", { length: 16 }).notNull().default("operator"),
  apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  configJson: jsonb("config_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  agentId: varchar("agent_id", { length: 64 }).notNull().references(() => agents.id),
  status: varchar("status", { length: 32 }).notNull().default("created"),
  instruction: text("instruction").notNull(),
  fingerprint: varchar("fingerprint", { length: 128 }),
  engineVersion: varchar("engine_version", { length: 16 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("runs_user_id_idx").on(table.userId),
  index("runs_status_idx").on(table.status),
]);

export const plans = pgTable("plans", {
  runId: uuid("run_id").primaryKey().references(() => runs.id, { onDelete: "cascade" }),
  planJson: jsonb("plan_json").notNull(),
  planHash: varchar("plan_hash", { length: 128 }).notNull(),
});

export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  tool: varchar("tool", { length: 64 }).notNull(),
  reversible: boolean("reversible").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("actions_run_id_idx").on(table.runId),
]);

export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  type: varchar("type", { length: 64 }).notNull(),
  payloadSmall: jsonb("payload_small"),
  payloadRef: varchar("payload_ref", { length: 256 }),
}, (table) => [
  index("events_run_id_idx").on(table.runId),
  index("events_type_idx").on(table.type),
]);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  uri: text("uri").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
}, (table) => [
  index("artifacts_run_id_idx").on(table.runId),
]);

export const checkpoints = pgTable("checkpoints", {
  runId: uuid("run_id").primaryKey().references(() => runs.id, { onDelete: "cascade" }),
  checkpointJson: jsonb("checkpoint_json").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const capabilityGrants = pgTable("capability_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 256 }).notNull(),
  capability: varchar("capability", { length: 256 }).notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("capability_grants_user_id_idx").on(table.userId),
]);

export const subagentRuns = pgTable("subagent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentRunId: uuid("parent_run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  childRunId: uuid("child_run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  task: text("task").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("subagent_runs_parent_idx").on(table.parentRunId),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(),
  resourceType: varchar("resource_type", { length: 32 }).notNull(),
  resourceId: varchar("resource_id", { length: 128 }),
  metadata: jsonb("metadata"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_log_user_id_idx").on(table.userId),
  index("audit_log_action_idx").on(table.action),
]);
