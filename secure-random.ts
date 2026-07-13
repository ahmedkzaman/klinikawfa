// Side-effect-free cryptographic randomness helpers.
// No top-level side effects: no Deno.serve, no env reads, no I/O.
// Callers may inject a `randomBytes` function for deterministic testing.

export type RandomBytesFn = (n: number) => Uint8Array;

const defaultRandomBytes: RandomBytesFn = (n) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
};

// Read a big-endian unsigned 32-bit integer from 4 bytes.
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3])
  ) >>> 0;
}

function assertPositiveInteger(value: unknown, name: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.floor(value) !== value ||
    value <= 0
  ) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/**
 * Uniform integer in [0, max) using rejection sampling over 32-bit samples.
 *
 * - `max` must be a positive integer <= 2**32.
 * - When `max === 2**32`, every 32-bit sample is accepted (no rejection).
 * - Threshold is computed with BigInt to avoid 32-bit overflow.
 */
export function randomIntBelow(
  max: number,
  randomBytes: RandomBytesFn = defaultRandomBytes,
): number {
  assertPositiveInteger(max, "max");
  if (max > 2 ** 32) {
    throw new RangeError("max must be <= 2**32");
  }

  const RANGE = 1n << 32n; // 2**32
  const maxBig = BigInt(max);
  // Largest multiple of max in [0, 2**32): threshold = RANGE - (RANGE % max).
  // When max === 2**32, RANGE % maxBig === 0n → threshold === RANGE → every sample accepted.
  const threshold = RANGE - (RANGE % maxBig);

  // Bounded-loop guard to prevent theoretical infinite loops if a caller supplies
  // a broken randomBytes; in practice acceptance probability is >= 0.5.
  for (let attempt = 0; attempt < 128; attempt++) {
    const bytes = randomBytes(4);
    if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
      throw new Error("randomBytes must return a Uint8Array of the requested length");
    }
    const sample = BigInt(readU32(bytes, 0));
    if (sample < threshold) {
      return Number(sample % maxBig);
    }
    // else: rejected, resample
  }
  throw new Error("randomIntBelow exceeded rejection sampling attempts");
}

/**
 * Pick `length` characters uniformly at random from `alphabet`.
 * - `alphabet` must be a non-empty string with length <= 2**32.
 * - `length` must be a positive integer <= 1024.
 * - Rejects Infinity, NaN, negative, zero, and fractional lengths explicitly.
 */
export function randomFromAlphabet(
  alphabet: string,
  length: number,
  randomBytes: RandomBytesFn = defaultRandomBytes,
): string {
  if (typeof alphabet !== "string" || alphabet.length === 0) {
    throw new RangeError("alphabet must be a non-empty string");
  }
  if (alphabet.length > 2 ** 32) {
    throw new RangeError("alphabet length must be <= 2**32");
  }
  assertPositiveInteger(length, "length");
  if (length > 1024) {
    throw new RangeError("length must be <= 1024");
  }

  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(randomIntBelow(alphabet.length, randomBytes));
  }
  return out;
}

// Room-code parameters preserved from the previous inline implementation:
// 32-character Crockford-style alphabet excluding I, O, 0, 1; six characters long.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(
  randomBytes: RandomBytesFn = defaultRandomBytes,
): string {
  return randomFromAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, randomBytes);
}
