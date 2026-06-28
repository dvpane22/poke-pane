export const AUTH_COOKIE = "pane-auth";

function readAppPassword() {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

export function isAppPasswordEnabled() {
  if (process.env.NODE_ENV !== "production") return false;
  return Boolean(readAppPassword());
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authCookieValue() {
  const password = readAppPassword();
  if (!password) return null;
  return sha256Hex(`pane-auth:${password}`);
}

export async function isAuthenticatedCookie(value: string | undefined) {
  const expected = await authCookieValue();
  if (!expected) return true;
  return value === expected;
}
