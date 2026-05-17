// Password hashing via PBKDF2 (Workers' WebCrypto SubtleCrypto).

export const PBKDF2_ITERATIONS_CURRENT = 600000;
export const DUMMY_HASH_SALT = "timing-normaliser-not-a-real-account-salt";

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS_CURRENT) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key, 256
  );
  return toHex(bits);
}
