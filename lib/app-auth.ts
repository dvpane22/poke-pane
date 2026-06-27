export const AUTH_COOKIE = "pane-auth";

export function isAppPasswordEnabled() {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authCookieValue() {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return null;
  return sha256Hex(`pane-auth:${password}`);
}

export async function isAuthenticatedCookie(value: string | undefined) {
  const expected = await authCookieValue();
  if (!expected) return true;
  return value === expected;
}
