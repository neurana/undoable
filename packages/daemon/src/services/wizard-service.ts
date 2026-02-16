import { randomUUID } from "node:crypto";
import { OnboardingService, type OnboardingProfile } from "./onboarding-service.js";

export type WizardStatus = "running" | "completed" | "cancelled";
export type WizardStepId = "userName" | "botName" | "timezone" | "personality" | "instructions";

export type WizardStep = {
  id: WizardStepId;
  prompt: string;
};

export type WizardAnswer = {
  stepId?: string;
  value?: unknown;
};

export type WizardInProgress = {
  done: false;
  step: WizardStep;
  progress: {
    current: number;
    total: number;
  };
};

export type WizardCompleted = {
  done: true;
  profile: OnboardingProfile;
};

export type WizardNextResult = WizardInProgress | WizardCompleted;

export type WizardStatusResult = {
  status: WizardStatus;
  error?: string;
};

type WizardSession = {
  id: string;
  status: WizardStatus;
  stepIndex: number;
  data: Partial<OnboardingProfile>;
};

type OnboardingStore = Pick<OnboardingService, "load" | "save">;

const STEPS: WizardStep[] = [
  { id: "userName", prompt: "What should I call you?" },
  { id: "botName", prompt: "What should your assistant be called?" },
  { id: "timezone", prompt: "What is your timezone? (e.g. America/Sao_Paulo)" },
  { id: "personality", prompt: "Describe the assistant personality you want." },
  { id: "instructions", prompt: "Any extra permanent instructions for the assistant?" },
];

export class WizardService {
  private readonly sessions = new Map<string, WizardSession>();

  constructor(private readonly onboarding: OnboardingStore = new OnboardingService()) {}

  async start(_params?: Record<string, unknown>): Promise<{ sessionId: string } & WizardNextResult> {
    for (const session of this.sessions.values()) {
      if (session.status === "running") {
        throw new Error("wizard already running");
      }
    }

    const current = this.onboarding.load();
    const sessionId = randomUUID();
    const session: WizardSession = {
      id: sessionId,
      status: "running",
      stepIndex: 0,
      data: {
        userName: current.userName,
        botName: current.botName,
        timezone: current.timezone,
        personality: current.personality,
        instructions: current.instructions,
      },
    };

    this.sessions.set(sessionId, session);
    const next = await this.next(sessionId);
    return { sessionId, ...next };
  }

  async next(sessionId: string, answer?: WizardAnswer): Promise<WizardNextResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("wizard not found");
    }
    if (session.status !== "running") {
      throw new Error("wizard not running");
    }

    if (answer) {
      this.applyAnswer(session, answer);
    }

    if (session.stepIndex >= STEPS.length) {
      const profile = this.onboarding.save({ ...session.data, completed: true });
      session.status = "completed";
      this.sessions.delete(session.id);
      return { done: true, profile };
    }

    const step = STEPS[session.stepIndex]!;
    return {
      done: false,
      step,
      progress: {
        current: session.stepIndex + 1,
        total: STEPS.length,
      },
    };
  }

  cancel(sessionId: string): WizardStatusResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("wizard not found");
    }
    session.status = "cancelled";
    this.sessions.delete(sessionId);
    return { status: "cancelled" };
  }

  status(sessionId: string): WizardStatusResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("wizard not found");
    }
    return { status: session.status };
  }

  private applyAnswer(session: WizardSession, answer: WizardAnswer): void {
    const currentStep = STEPS[session.stepIndex];
    if (!currentStep) {
      throw new Error("wizard already completed");
    }

    const stepId = typeof answer.stepId === "string" ? answer.stepId : "";
    if (stepId !== currentStep.id) {
      throw new Error(`expected answer for step ${currentStep.id}`);
    }

    if (typeof answer.value !== "string") {
      throw new Error("wizard answer value must be a string");
    }

    const value = answer.value.trim();
    if (!value) {
      throw new Error(`wizard answer for ${currentStep.id} cannot be empty`);
    }

    session.data[currentStep.id] = value;
    session.stepIndex += 1;
  }
}
