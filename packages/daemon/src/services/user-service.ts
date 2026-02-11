import { generateId, generateApiKey } from "@undoable/shared";
import { hashKey } from "../auth/api-key.js";
import type { UserRole } from "../auth/middleware.js";

export type UserRecord = {
  id: string;
  username: string;
  role: UserRole;
  apiKeyHash: string;
  createdAt: Date;
};

export type CreateUserInput = {
  username: string;
  role?: UserRole;
};

export type CreateUserResult = {
  user: UserRecord;
  apiKey: string;
};

export class UserService {
  private users = new Map<string, UserRecord>();
  private usernameIndex = new Map<string, string>();

  create(input: CreateUserInput): CreateUserResult {
    if (this.usernameIndex.has(input.username)) {
      throw new Error(`Username "${input.username}" already exists`);
    }

    const apiKey = generateApiKey();
    const user: UserRecord = {
      id: generateId(),
      username: input.username,
      role: input.role ?? "operator",
      apiKeyHash: hashKey(apiKey),
      createdAt: new Date(),
    };

    this.users.set(user.id, user);
    this.usernameIndex.set(user.username, user.id);

    return { user, apiKey };
  }

  getById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  getByUsername(username: string): UserRecord | undefined {
    const id = this.usernameIndex.get(username);
    return id ? this.users.get(id) : undefined;
  }

  getByApiKeyHash(hash: string): UserRecord | undefined {
    for (const user of this.users.values()) {
      if (user.apiKeyHash === hash) return user;
    }
    return undefined;
  }

  list(): UserRecord[] {
    return Array.from(this.users.values());
  }

  delete(id: string): boolean {
    const user = this.users.get(id);
    if (!user) return false;
    this.usernameIndex.delete(user.username);
    this.users.delete(id);
    return true;
  }

  count(): number {
    return this.users.size;
  }
}
