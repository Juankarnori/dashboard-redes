import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * Cifrado de tokens de acceso (Meta, y futuras redes) antes de guardarlos
 * en Supabase. AES-256-GCM: autenticado, con IV aleatorio por valor.
 *
 * META_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.
 * Generarla con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY no está definida. Genera una con:\n" +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `META_TOKEN_ENCRYPTION_KEY debe decodificar a 32 bytes (actual: ${key.length}).`
    );
  }
  return key;
}

/** Devuelve un string empaquetado "iv:authTag:ciphertext" en base64. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

export function decryptToken(packed: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = packed.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato de token cifrado inválido.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
