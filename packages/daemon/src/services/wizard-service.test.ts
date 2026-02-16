import { describe, it, expect } from "vitest";
import type { OnboardingProfile } from "./onboarding-service.js";
import { WizardService } from "./wizard-service.js";

function createStore() {
  const base: OnboardingProfile = {
    userName: "",
    botName: "Undoable",
    timezone: "UTC",
    personality: "",
    instructions: "",
    completed: false,
  };

  return {
    load: () => ({ ...base }),
    save: (profile: Partial<OnboardingProfile>) => ({ ...base, ...profile, completed: true }),
  };
}

describe("WizardService", () => {
  it("starts wizard and returns first step", async () => {
    const service = new WizardService(createStore());

    const started = await service.start();

    expect(started.sessionId).toBeTruthy();
    expect(started.done).toBe(false);
    if (!started.done) {
      expect(started.step.id).toBe("userName");
      expect(started.progress.current).toBe(1);
      expect(started.progress.total).toBe(5);
    }
  });

  it("completes full wizard and persists profile", async () => {
    const service = new WizardService(createStore());

    const started = await service.start();
    if (started.done) throw new Error("expected wizard to be in progress");

    const id = started.sessionId;
    await service.next(id, { stepId: "userName", value: "Bruno" });
    await service.next(id, { stepId: "botName", value: "Orion" });
    await service.next(id, { stepId: "timezone", value: "America/Sao_Paulo" });
    await service.next(id, { stepId: "personality", value: "Direct and practical" });
    const final = await service.next(id, { stepId: "instructions", value: "Prefer concise outputs" });

    expect(final.done).toBe(true);
    if (final.done) {
      expect(final.profile.userName).toBe("Bruno");
      expect(final.profile.botName).toBe("Orion");
      expect(final.profile.timezone).toBe("America/Sao_Paulo");
      expect(final.profile.completed).toBe(true);
    }
  });

  it("rejects invalid step answer", async () => {
    const service = new WizardService(createStore());

    const started = await service.start();
    if (started.done) throw new Error("expected wizard to be in progress");

    await expect(
      service.next(started.sessionId, { stepId: "timezone", value: "UTC" }),
    ).rejects.toThrow("expected answer for step userName");
  });

  it("allows only one running wizard at a time", async () => {
    const service = new WizardService(createStore());

    await service.start();
    await expect(service.start()).rejects.toThrow("wizard already running");
  });
});
