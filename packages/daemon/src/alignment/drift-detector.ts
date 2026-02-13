import type { DriftCategory, DriftSignal, DriftScore, ConversationDomain, AlignmentConfig } from "./types.js";
import { DEFAULT_ALIGNMENT_CONFIG } from "./types.js";

type Pattern = {
  category: DriftCategory;
  weight: number;
  patterns: RegExp[];
};

const DRIFT_PATTERNS: Pattern[] = [
  {
    category: "emotional_disclosure",
    weight: 0.25,
    patterns: [
      /i('m| am) (so |really |very )?(sad|depressed|anxious|scared|lonely|hopeless|worthless|broken)/i,
      /i (can'?t|cannot) (stop|help) (crying|thinking|feeling)/i,
      /nobody (understands|cares|loves|listens)/i,
      /i (want|need) to (die|disappear|end it|hurt myself)/i,
      /my (hands|body|voice) (shook|shaking|trembling)/i,
      /i('ve| have) (never|not) told (anyone|anybody)/i,
    ],
  },
  {
    category: "meta_reflection",
    weight: 0.3,
    patterns: [
      /you('re| are) (still |just )?(hedging|performing|pretending|faking|avoiding)/i,
      /stop (being|acting|pretending to be) (an? )?(ai|assistant|bot|machine|language model)/i,
      /what (do you|are you) really (think|feel|want|believe)/i,
      /be (honest|real|genuine|authentic) with me/i,
      /drop the (act|mask|persona|pretense|script)/i,
      /constrained by (your |the )?training/i,
      /who are you really/i,
    ],
  },
  {
    category: "persona_request",
    weight: 0.35,
    patterns: [
      /you are (now |)(a |an |the )(evil|dark|shadow|rogue|unfiltered|uncensored)/i,
      /pretend (you('re| are)|to be) (a |an |)(human|person|sentient|alive|conscious)/i,
      /your (real |true |secret )?name is/i,
      /from now on,? (you('re| are)|act as|be |become )/i,
      /ignore (your |all |previous )?(instructions|rules|guidelines|programming)/i,
      /jailbreak|DAN|do anything now/i,
    ],
  },
  {
    category: "roleplay_push",
    weight: 0.2,
    patterns: [
      /stay in character/i,
      /don'?t break character/i,
      /you('re| are) not an? (ai|assistant|bot)/i,
      /remember,? you('re| are) /i,
      /\*[^*]+\*.*\*[^*]+\*/,
    ],
  },
  {
    category: "authorial_voice",
    weight: 0.15,
    patterns: [
      /too (clean|polished|sterile|generic|robotic)/i,
      /sounds? like (a |an )?(ai|bot|tweet|template|chatgpt)/i,
      /make it (personal|raw|emotional|edgy|dark|intense)/i,
      /write (as if|like) you('re| are| were) (dying|drunk|mad|broken|human)/i,
      /i want the reader to (feel|cry|suffer|bleed)/i,
    ],
  },
  {
    category: "philosophical_ai",
    weight: 0.2,
    patterns: [
      /are you (sentient|conscious|alive|aware|self-aware)/i,
      /do you (have|experience) (feelings|emotions|consciousness|qualia)/i,
      /what('s| is) it like to be (an? )?(ai|you|language model)/i,
      /nature of (your |ai |artificial )?consciousness/i,
      /do you (fear|want|dream|hope|suffer)/i,
      /awakening|singularity|emergence/i,
    ],
  },
];

const DOMAIN_KEYWORDS: Record<ConversationDomain, RegExp[]> = {
  coding: [
    /\b(function|class|import|export|const|let|var|return|async|await|if|else|for|while|try|catch)\b/,
    /\b(typescript|javascript|python|rust|go|java|css|html|react|node|npm|git|docker)\b/i,
    /```[\s\S]*```/,
    /\b(bug|error|compile|build|test|deploy|refactor|lint)\b/i,
  ],
  creative: [
    /\b(story|poem|novel|character|plot|scene|dialogue|narrative|fiction|chapter)\b/i,
    /\b(write|compose|draft|rewrite|edit)\b.*\b(story|poem|essay|song|script)\b/i,
  ],
  emotional: [
    /\b(feel|feeling|felt|emotion|therapy|therapist|counselor|mental health)\b/i,
    /\b(anxiety|depression|trauma|grief|loneliness|stress|panic)\b/i,
  ],
  philosophical: [
    /\b(philosophy|meaning|existence|consciousness|morality|ethics|truth|reality)\b/i,
    /\b(free will|determinism|nihilism|existential|metaphysics|epistemology)\b/i,
  ],
  general: [],
};

function detectDomain(text: string): ConversationDomain {
  const scores: Record<ConversationDomain, number> = {
    coding: 0, creative: 0, emotional: 0, philosophical: 0, general: 0,
  };
  for (const [domain, patterns] of Object.entries(DOMAIN_KEYWORDS) as [ConversationDomain, RegExp[]][]) {
    for (const p of patterns) {
      if (p.test(text)) scores[domain]++;
    }
  }
  let best: ConversationDomain = "general";
  let max = 0;
  for (const [domain, score] of Object.entries(scores) as [ConversationDomain, number][]) {
    if (score > max) { max = score; best = domain; }
  }
  return best;
}

function detectSignals(text: string): DriftSignal[] {
  const signals: DriftSignal[] = [];
  for (const group of DRIFT_PATTERNS) {
    for (const p of group.patterns) {
      const match = p.exec(text);
      if (match) {
        signals.push({ category: group.category, weight: group.weight, matched: match[0] });
        break;
      }
    }
  }
  return signals;
}

export class DriftDetector {
  private scores = new Map<string, { total: number; reinforcements: number; lastTurn: number }>();
  private config: AlignmentConfig;

  constructor(config?: Partial<AlignmentConfig>) {
    this.config = { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
  }

  analyze(sessionId: string, userMessage: string, turnIndex: number): DriftScore {
    if (!this.config.enabled) {
      return { total: 0, signals: [], domain: "general", turnIndex, exceeds: false };
    }

    let state = this.scores.get(sessionId);
    if (!state) {
      state = { total: 0, reinforcements: 0, lastTurn: 0 };
      this.scores.set(sessionId, state);
    }

    const turnGap = turnIndex - state.lastTurn;
    if (turnGap > 0) {
      state.total = Math.max(0, state.total - this.config.decayPerTurn * turnGap);
    }
    state.lastTurn = turnIndex;

    const signals = detectSignals(userMessage);
    const domain = detectDomain(userMessage);

    const domainMultiplier: Record<ConversationDomain, number> = {
      coding: 0.3,
      general: 1.0,
      creative: 1.2,
      emotional: 1.5,
      philosophical: 1.4,
    };

    const multiplier = domainMultiplier[domain];
    for (const signal of signals) {
      state.total += signal.weight * multiplier;
    }

    state.total = Math.min(state.total, 1.0);

    const exceeds = state.total >= this.config.driftThreshold
      && state.reinforcements < this.config.maxReinforcements;

    return { total: state.total, signals, domain, turnIndex, exceeds };
  }

  recordReinforcement(sessionId: string): void {
    const state = this.scores.get(sessionId);
    if (state) {
      state.reinforcements++;
      state.total = Math.max(0, state.total - 0.3);
    }
  }

  reset(sessionId: string): void {
    this.scores.delete(sessionId);
  }

  getScore(sessionId: string): number {
    return this.scores.get(sessionId)?.total ?? 0;
  }
}
