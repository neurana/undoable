const required = { major: 20, minor: 10, patch: 0 };

function parseVersion(raw) {
  const [major = "0", minor = "0", patch = "0"] = String(raw).split(".");
  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
  };
}

function isAtLeast(actual, min) {
  if (actual.major !== min.major) return actual.major > min.major;
  if (actual.minor !== min.minor) return actual.minor >= min.minor;
  return actual.patch >= min.patch;
}

const actual = parseVersion(process.versions.node);
if (!isAtLeast(actual, required)) {
  const got = process.versions.node;
  const need = `${required.major}.${required.minor}.${required.patch}`;
  console.error(`[undoable] Build requires Node.js >= ${need}, found ${got}.`);
  console.error("[undoable] Please install Node 20.10+ and retry `pnpm build`.");
  process.exit(1);
}
