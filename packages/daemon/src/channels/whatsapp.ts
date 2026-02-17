import * as path from "node:path";
import os from "node:os";
import type { Channel, ChannelConfig, ChannelMessage, ChannelStatus } from "./types.js";
import { createBackoff, resetBackoff, scheduleReconnect, type BackoffState } from "./channel-utils.js";

const AUTH_DIR = path.join(os.homedir(), ".undoable", "channels", "whatsapp", "auth");

export function createWhatsAppChannel(): Channel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sock: any = null;
  let connected = false;
  let accountName: string | undefined;
  let lastError: string | undefined;
  let qrDataUrl: string | undefined;
  let startedAt: number | undefined;
  let lastConnectedAt: number | undefined;
  let lastDisconnectedAt: number | undefined;
  let lastErrorAt: number | undefined;
  let backoff: BackoffState = createBackoff();
  let savedConfig: ChannelConfig | undefined;
  let savedOnMessage: ((msg: ChannelMessage) => void) | undefined;

  return {
    id: "whatsapp",
    name: "WhatsApp",

    async start(_config: ChannelConfig, onMessage: (msg: ChannelMessage) => void) {
      savedConfig = _config;
      savedOnMessage = onMessage;
      startedAt = startedAt ?? Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baileys = await import("@whiskeysockets/baileys") as any;
      const makeWASocket = baileys.default ?? baileys.makeWASocket ?? baileys;
      const useMultiFileAuthState = baileys.useMultiFileAuthState;
      const DisconnectReason = baileys.DisconnectReason;
      const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
      const qrcode = await import("qrcode").catch(() => null);

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: { connection?: string; lastDisconnect?: { error?: { output?: { statusCode?: number } } }; qr?: string }) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && qrcode) {
          try {
            qrDataUrl = await qrcode.toDataURL(qr);
          } catch {
            qrDataUrl = undefined;
          }
        }

        if (connection === "close") {
          connected = false;
          lastDisconnectedAt = Date.now();
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode !== DisconnectReason.loggedOut) {
            if (savedConfig && savedOnMessage) {
              scheduleReconnect(backoff, () => this.start(savedConfig!, savedOnMessage!));
            }
          } else {
            lastError = "Logged out from WhatsApp";
            lastErrorAt = Date.now();
          }
        } else if (connection === "open") {
          connected = true;
          lastConnectedAt = Date.now();
          lastError = undefined;
          qrDataUrl = undefined;
          resetBackoff(backoff);
          accountName = sock?.user?.name ?? sock?.user?.id;
        }
      });

      sock.ev.on("messages.upsert", (upsert: { messages: Array<Record<string, unknown>>; type: string }) => {
        if (upsert.type !== "notify") return;

        for (const msg of upsert.messages) {
          const key = msg.key as { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };
          if (key.fromMe) continue;

          const message = msg.message as Record<string, unknown> | undefined;
          if (!message) continue;

          const conversation = (message.conversation as string)
            ?? (message.extendedTextMessage as { text?: string } | undefined)?.text;
          if (!conversation) continue;

          const jid = key.remoteJid ?? "";
          const isGroup = jid.endsWith("@g.us");

          const channelMsg: ChannelMessage = {
            id: key.id ?? String(Date.now()),
            channelId: "whatsapp",
            from: key.participant ?? jid,
            to: jid,
            text: conversation,
            timestamp: (msg.messageTimestamp as number) ? (msg.messageTimestamp as number) * 1000 : Date.now(),
            chatType: isGroup ? "group" : "direct",
            raw: msg,
          };

          onMessage(channelMsg);
        }
      });
    },

    async stop() {
      resetBackoff(backoff);
      if (sock) {
        sock.end(undefined);
        sock = null;
      }
      connected = false;
      qrDataUrl = undefined;
    },

    async send(to: string, text: string) {
      if (!sock) throw new Error("WhatsApp socket not started");
      await sock.sendMessage(to, { text });
    },

    status(): ChannelStatus {
      return {
        channelId: "whatsapp", connected, accountName, error: lastError, qrDataUrl,
        reconnectAttempts: backoff.attempt, startedAt, lastConnectedAt, lastDisconnectedAt, lastErrorAt,
      };
    },

    getClient() {
      return sock;
    },
  };
}
