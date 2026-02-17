export type ChannelId = "telegram" | "discord" | "slack" | "whatsapp";

export type ChannelMessage = {
  id: string;
  channelId: ChannelId;
  from: string;
  fromName?: string;
  to: string;
  text: string;
  mediaUrl?: string;
  threadId?: string;
  timestamp: number;
  chatType: "direct" | "group";
  raw?: unknown;
};

export type ChannelStatus = {
  channelId: ChannelId;
  connected: boolean;
  accountName?: string;
  error?: string;
  qrDataUrl?: string;
  reconnectAttempts?: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastErrorAt?: number;
  startedAt?: number;
};

export type ChannelConfig = {
  channelId: ChannelId;
  enabled: boolean;
  token?: string;
  extra?: Record<string, unknown>;
  allowDMs?: boolean;
  allowGroups?: boolean;
  userAllowlist?: string[];
  userBlocklist?: string[];
  rateLimit?: number;
  maxMediaBytes?: number;
};

export interface Channel {
  id: ChannelId;
  name: string;
  start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void>;
  stop(): Promise<void>;
  send(to: string, text: string, opts?: { threadId?: string }): Promise<void>;
  status(): ChannelStatus;
  getClient(): unknown;
}
