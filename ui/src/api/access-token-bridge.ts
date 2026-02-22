const ACCESS_TOKEN_PARAM = "access_token";
const ACCESS_TOKEN_STORAGE_KEY = "undoable.instance.access_token";

function normalizeToken(value: string | null | undefined): string | null {
  const token = value?.trim();
  return token ? token : null;
}

function readTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeToken(params.get(ACCESS_TOKEN_PARAM));
  } catch {
    return null;
  }
}

function readTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeToken(window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeTokenToStorage(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures (private mode/restricted storage).
  }
}

function resolveAccessToken(): string | null {
  const fromUrl = readTokenFromUrl();
  if (fromUrl) {
    writeTokenToStorage(fromUrl);
    return fromUrl;
  }
  return readTokenFromStorage();
}

function appendTokenToApiUrl(url: URL, token: string): URL {
  if (url.origin !== window.location.origin) return url;
  if (!url.pathname.startsWith("/api")) return url;
  if (!url.searchParams.has(ACCESS_TOKEN_PARAM)) {
    url.searchParams.set(ACCESS_TOKEN_PARAM, token);
  }
  return url;
}

function patchFetch(token: string): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (input instanceof Request) {
        const requestUrl = new URL(input.url, window.location.href);
        const updatedUrl = appendTokenToApiUrl(requestUrl, token);
        if (updatedUrl.toString() !== requestUrl.toString()) {
          const cloned = new Request(updatedUrl.toString(), input);
          return nativeFetch(cloned, init);
        }
        return nativeFetch(input, init);
      }

      const inputUrl = new URL(String(input), window.location.href);
      const updatedUrl = appendTokenToApiUrl(inputUrl, token);
      if (updatedUrl.origin === window.location.origin) {
        const relative =
          updatedUrl.pathname + updatedUrl.search + updatedUrl.hash;
        return nativeFetch(relative, init);
      }
      return nativeFetch(updatedUrl.toString(), init);
    } catch {
      return nativeFetch(input, init);
    }
  };
}

let bootstrapped = false;

export function bootstrapApiAccessTokenBridge(): void {
  if (bootstrapped || typeof window === "undefined") return;
  const token = resolveAccessToken();
  if (!token) return;
  patchFetch(token);
  bootstrapped = true;
}

