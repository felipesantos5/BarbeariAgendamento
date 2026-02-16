import crypto from "crypto";

/**
 * Comparação timing-safe para evitar timing attacks
 * @param {string} a - Primeira string
 * @param {string} b - Segunda string
 * @returns {boolean} - True se forem iguais
 */
export function timingSafeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Para evitar timing attack no length, fazemos uma comparação dummy
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
