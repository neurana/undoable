import { describe, expect, it } from "vitest";
import {
  daemonRequest,
  isLoopbackDaemonBaseUrl,
  resolveDaemonBaseUrl,
} from "./daemon-client.js";

describe("daemon-client", () => {
  it("detects loopback daemon URLs", () => {
    expect(isLoopbackDaemonBaseUrl("http://127.0.0.1:7433")).toBe(true);
    expect(isLoopbackDaemonBaseUrl("http://localhost:7433")).toBe(true);
    expect(isLoopbackDaemonBaseUrl("http://[::1]:7433")).toBe(true);
    expect(isLoopbackDaemonBaseUrl("https://10.0.0.2:7433")).toBe(false);
    expect(isLoopbackDaemonBaseUrl("https://api.example.com")).toBe(false);
  });

  it("normalizes daemon base URL by trimming trailing slashes", () => {
    expect(resolveDaemonBaseUrl("http://127.0.0.1:7433///")).toBe(
      "http://127.0.0.1:7433",
    );
  });

  it("requires explicit token for non-loopback URL overrides", async () => {
    await expect(
      daemonRequest("/health", {
        url: "https://remote.example.com",
      }),
    ).rejects.toThrow(/requires an explicit token/i);
  });
});

