import crypto from "node:crypto";

/**
 * Field-level envelope encryption for Tier-1 PII (Prompt 8).
 *
 * Wire format:  v1:<wrappedKey b64>:<iv b64>:<tag b64>:<ciphertext b64>
 *   - a random 256-bit data key (DEK) encrypts each value with AES-256-GCM
 *   - the DEK is wrapped (AES-256-GCM) with the master key (KEK)
 *
 * KMS SEAM: in production, replace masterKey() with an AWS KMS Decrypt call
 * (or cache a KMS-generated data key). The wire format is deliberately
 * KMS-shaped so the swap does not require re-encrypting stored data.
 */

const VERSION = "v1";
let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PII_MASTER_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("PII_MASTER_KEY missing/short — encryption of Tier-1 PII refused");
  }
  cachedKey = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : crypto.createHash("sha256").update(raw, "utf8").digest();
  return cachedKey;
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const wrapIv = crypto.randomBytes(12);
  const wrap = crypto.createCipheriv("aes-256-gcm", masterKey(), wrapIv);
  const wrapped = Buffer.concat([wrap.update(dek), wrap.final()]);
  const wrapTag = wrap.getAuthTag();

  return [
    VERSION,
    Buffer.concat([wrapIv, wrapTag, wrapped]).toString("base64"),
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

export function decryptField(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const parts = blob.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  const [, wrappedB64, ivB64, tagB64, ctB64] = parts;
  if (!wrappedB64 || !ivB64 || !tagB64 || !ctB64) return null;
  try {
    const wrappedBuf = Buffer.from(wrappedB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");

    const wrapIv = wrappedBuf.subarray(0, 12);
    const wrapTag = wrappedBuf.subarray(12, 28);
    const wrapped = wrappedBuf.subarray(28);

    const unwrap = crypto.createDecipheriv("aes-256-gcm", masterKey(), wrapIv);
    unwrap.setAuthTag(wrapTag);
    const dek = Buffer.concat([unwrap.update(wrapped), unwrap.final()]);

    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered ciphertext — never leak anything.
    return null;
  }
}

/**
 * Deterministic HMAC blind index so exact-name search works against encrypted
 * values. Normalizes case/whitespace; never reversible into the plaintext.
 */
export function blindIndex(value: string | null | undefined): string | null {
  if (!value) return null;
  const norm = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  return crypto.createHmac("sha256", masterKey()).update(`idx:${norm}`).digest("hex");
}

/** Encrypt-and-clear fragment for Prisoner Tier-1 writes; legacy plaintext cols always NULLed. */
export function piiWriteFragment(fields: {
  fullName?: string | null;
  dateOfBirth?: Date | string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  photoUrl?: string | null;
}) {
  return {
    ...(fields.fullName !== undefined
      ? {
          fullNameEnc: encryptField(fields.fullName),
          nameIdx: blindIndex(fields.fullName),
          fullName: null,
        }
      : {}),
    ...(fields.dateOfBirth !== undefined
      ? {
          dateOfBirthEnc: encryptField(
            fields.dateOfBirth ? new Date(fields.dateOfBirth).toISOString().slice(0, 10) : null,
          ),
          dateOfBirth: null,
        }
      : {}),
    ...(fields.nextOfKinName !== undefined
      ? { nextOfKinNameEnc: encryptField(fields.nextOfKinName), nextOfKinName: null }
      : {}),
    ...(fields.nextOfKinPhone !== undefined
      ? { nextOfKinPhoneEnc: encryptField(fields.nextOfKinPhone), nextOfKinPhone: null }
      : {}),
    ...(fields.photoUrl !== undefined
      ? { photoUrlEnc: encryptField(fields.photoUrl), photoUrl: null }
      : {}),
  };
}

/** Decrypted view of a prisoner row (legacy plaintext fallback for pre-backfill rows). */
export function piiPublic(p: {
  fullName?: string | null;
  fullNameEnc?: string | null;
  dateOfBirth?: Date | null;
  dateOfBirthEnc?: string | null;
  nextOfKinName?: string | null;
  nextOfKinNameEnc?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinPhoneEnc?: string | null;
  photoUrl?: string | null;
  photoUrlEnc?: string | null;
}) {
  const dobStr = decryptField(p.dateOfBirthEnc) ?? (p.dateOfBirth ? p.dateOfBirth.toISOString() : null);
  return {
    fullName: decryptField(p.fullNameEnc) ?? p.fullName ?? "",
    dateOfBirth: dobStr,
    nextOfKinName: decryptField(p.nextOfKinNameEnc) ?? p.nextOfKinName ?? null,
    nextOfKinPhone: decryptField(p.nextOfKinPhoneEnc) ?? p.nextOfKinPhone ?? null,
    photoUrl: decryptField(p.photoUrlEnc) ?? p.photoUrl ?? null,
  };
}
