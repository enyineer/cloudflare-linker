/** Small AES-GCM helpers over WebCrypto (available in Workers and Bun). The
 *  encrypt/decrypt/import functions are pure given a key, so they're unit-testable. */

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32)); // AES-256
}

// Copy into a fresh ArrayBuffer-backed view so the type satisfies BufferSource
// (TS 5.7 made Uint8Array generic over ArrayBufferLike, which crypto.subtle rejects).
function view(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", view(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = view(new TextEncoder().encode(plaintext));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv) };
}

export async function decryptString(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: view(fromBase64(iv)) }, key, view(fromBase64(ciphertext)));
  return new TextDecoder().decode(pt);
}
