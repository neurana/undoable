export const USER_ROLES = ["admin", "operator", "viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type User = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ts: string;
};
