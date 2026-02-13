const DANGEROUS_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "RUBYLIB",
  "PERL5LIB",
  "BASH_ENV",
  "ENV",
  "GCONV_PATH",
  "IFS",
  "SSLKEYLOGFILE",
]);

const DANGEROUS_ENV_PREFIXES = ["DYLD_", "LD_"];

export function validateEnv(env: Record<string, string>): void {
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (DANGEROUS_ENV_VARS.has(upper)) {
      throw new Error(`Security: environment variable '${key}' is forbidden.`);
    }
    for (const prefix of DANGEROUS_ENV_PREFIXES) {
      if (upper.startsWith(prefix)) {
        throw new Error(`Security: environment variable '${key}' is forbidden.`);
      }
    }
    if (upper === "PATH") {
      throw new Error("Security: custom 'PATH' is forbidden during execution.");
    }
  }
}

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[rf]+\s+)?\//,
  /\bmkfs\b/,
  /\bdd\s+.*of=\//,
  />\s*\/dev\/sd/,
  /\bchmod\s+(-R\s+)?777\s+\//,
  /\bchown\s+(-R\s+)?.*\s+\//,
  /\bsudo\s+rm\b/,
  /\bformat\b.*\/dev\//,
];

export function isDestructiveCommand(command: string): boolean {
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  return false;
}
