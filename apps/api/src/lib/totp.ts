import crypto from "node:crypto";

/**
 * Minimal RFC 6238 TOTP (30s step, SHA-1, 6 digits) + RFC 4648 base32.
 * Implemented on node:crypto to avoid an extra dependency; behaviour matches
 * Google Authenticator / Authy defaults.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretKey: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secretKey).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function totpNow(secretB32: string, stepOffset = 0): string {
  const key = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 30_000) + stepOffset;
  return hotp(key, counter);
}

/** Verify a 6-digit code allowing +/- 1 time step of clock drift. */
export function verifyTotp(secretB32: string, code: string): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  for (const drift of [-1, 0, 1]) {
    if (totpNow(secretB32, drift) === clean) return true;
  }
  return false;
}

export function otpauthUrl(email: string, secretB32: string): string {
  const label = encodeURIComponent(`RIHAI SETU:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent("RIHAI SETU")}&algorithm=SHA1&digits=6&period=30`;
}
