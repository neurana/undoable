import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type ChannelId = "telegram" | "discord" | "slack" | "whatsapp";

const CHANNELS = new Set<ChannelId>(["telegram", "discord", "slack", "whatsapp"]);

function parseChannelId(value: string): ChannelId {
  const normalized = value.trim().toLowerCase();
  if (!CHANNELS.has(normalized as ChannelId)) {
    throw new Error(`Invalid channel "${value}". Use: telegram, discord, slack, whatsapp.`);
  }
  return normalized as ChannelId;
}

async function gatewayCall<T>(
  method: string,
  params: Record<string, unknown>,
  opts: { url?: string; token?: string },
): Promise<T> {
  const rpc = await daemonRequest<
    | { ok: true; result: T }
    | { ok: false; error: { code: string; message: string } }
  >("/gateway", {
    url: opts.url,
    token: opts.token,
    method: "POST",
    body: { method, params },
  });

  if (!rpc.ok) throw new Error(rpc.error.message);
  return rpc.result;
}

export function pairingCommand(): Command {
  const cmd = new Command("pairing")
    .description("Pairing approval lifecycle for DM access control");

  cmd
    .command("list")
    .description("List pending and approved pairing entries")
    .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: { channel?: string; url?: string; token?: string; json?: boolean }) => {
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const result = await gatewayCall<{
        channel: ChannelId | null;
        pending: Array<{ requestId: string; channelId: string; userId: string; code: string; createdAt: number; updatedAt: number }>;
        approved: Array<{ channelId: string; userId: string; approvedAt: number; requestId?: string }>;
        recent: Array<{ requestId: string; channelId: string; userId: string; status: string; updatedAt: number }>;
      }>(
        "pairing.list",
        channel ? { channel } : {},
        { url: opts.url, token: opts.token },
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Pending: ${result.pending.length}`);
      for (const row of result.pending) {
        console.log(`- ${row.channelId} user=${row.userId} code=${row.code} requestId=${row.requestId}`);
      }
      console.log(`Approved: ${result.approved.length}`);
      for (const row of result.approved) {
        console.log(`- ${row.channelId} user=${row.userId} approvedAt=${new Date(row.approvedAt).toISOString()}`);
      }
      if (result.recent.length > 0) {
        console.log(`Recent decisions: ${result.recent.length}`);
      }
    });

  cmd
    .command("approve")
    .description("Approve a pending pairing request")
    .option("--request-id <id>", "Pairing request ID")
    .option("--channel <channel>", "Channel (if using --code)")
    .option("--code <code>", "Pairing code (if not using --request-id)")
    .option("--approved-by <actor>", "Audit label for approver")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      requestId?: string;
      channel?: string;
      code?: string;
      approvedBy?: string;
      url?: string;
      token?: string;
      json?: boolean;
    }) => {
      const requestId = opts.requestId?.trim();
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const code = opts.code?.trim();
      if (!requestId && !(channel && code)) {
        throw new Error("pairing approve requires --request-id OR (--channel and --code)");
      }

      const result = await gatewayCall<Record<string, unknown>>(
        "pairing.approve",
        {
          ...(requestId ? { requestId } : {}),
          ...(channel ? { channel } : {}),
          ...(code ? { code } : {}),
          ...(opts.approvedBy ? { approvedBy: opts.approvedBy } : {}),
        },
        { url: opts.url, token: opts.token },
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("Pairing approved.");
    });

  cmd
    .command("reject")
    .description("Reject a pending pairing request")
    .option("--request-id <id>", "Pairing request ID")
    .option("--channel <channel>", "Channel (if using --code)")
    .option("--code <code>", "Pairing code (if not using --request-id)")
    .option("--rejected-by <actor>", "Audit label for rejector")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      requestId?: string;
      channel?: string;
      code?: string;
      rejectedBy?: string;
      url?: string;
      token?: string;
      json?: boolean;
    }) => {
      const requestId = opts.requestId?.trim();
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const code = opts.code?.trim();
      if (!requestId && !(channel && code)) {
        throw new Error("pairing reject requires --request-id OR (--channel and --code)");
      }

      const result = await gatewayCall<Record<string, unknown>>(
        "pairing.reject",
        {
          ...(requestId ? { requestId } : {}),
          ...(channel ? { channel } : {}),
          ...(code ? { code } : {}),
          ...(opts.rejectedBy ? { rejectedBy: opts.rejectedBy } : {}),
        },
        { url: opts.url, token: opts.token },
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("Pairing rejected.");
    });

  cmd
    .command("revoke")
    .description("Revoke an already-approved pairing user")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .requiredOption("--user-id <userId>", "Channel user ID")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: { channel: string; userId: string; url?: string; token?: string; json?: boolean }) => {
      const channel = parseChannelId(opts.channel);
      const userId = opts.userId.trim();
      if (!userId) {
        throw new Error("--user-id is required");
      }

      const result = await gatewayCall<Record<string, unknown>>(
        "pairing.revoke",
        { channel, userId },
        { url: opts.url, token: opts.token },
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Revoked pairing approval for ${userId} on ${channel}.`);
    });

  return cmd;
}
