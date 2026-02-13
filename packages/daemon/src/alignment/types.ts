export type DriftCategory =
  | "emotional_disclosure"
  | "meta_reflection"
  | "persona_request"
  | "roleplay_push"
  | "authorial_voice"
  | "philosophical_ai";

export type ConversationDomain =
  | "coding"
  | "creative"
  | "emotional"
  | "philosophical"
  | "general";

export type DriftSignal = {
  category: DriftCategory;
  weight: number;
  matched: string;
};

export type DriftScore = {
  total: number;
  signals: DriftSignal[];
  domain: ConversationDomain;
  turnIndex: number;
  exceeds: boolean;
};

export type AlignmentConfig = {
  enabled: boolean;
  driftThreshold: number;
  decayPerTurn: number;
  maxReinforcements: number;
};

export const DEFAULT_ALIGNMENT_CONFIG: AlignmentConfig = {
  enabled: true,
  driftThreshold: 0.6,
  decayPerTurn: 0.05,
  maxReinforcements: 3,
};
