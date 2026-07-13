import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateRoomCode,
  randomFromAlphabet,
  randomIntBelow,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./secure-random.ts";

// Scripted RNG that yields pre-defined byte chunks in order. Fails loudly if
// the module asks for more randomness than the test script provided or if the
// requested chunk length does not match the scripted chunk.
function scriptedBytes(chunks: Uint8Array[]): (n: number) => Uint8Array {
  let i = 0;
  return (n: number) => {
    if (i >= chunks.length) {
      throw new Error(`scriptedBytes exhausted after ${i} draws`);
    }
    const chunk = chunks[i++];
    if (chunk.length !== n) {
      throw new Error(`scriptedBytes: expected ${n} bytes, got ${chunk.length}`);
    }
    return chunk;
  };
}

// Big-endian encode a uint32 into 4 bytes.
function u32Bytes(v: number): Uint8Array {
  if (v < 0 || v > 0xffffffff || Math.floor(v) !== v) {
    throw new Error(`u32Bytes: out of range ${v}`);
  }
  return new Uint8Array([
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

// ---------------- randomIntBelow: rejection boundary ----------------
// For max=10, threshold = 2**32 - (2**32 % 10) = 4294967296 - 6 = 4294967290.

Deno.test("randomIntBelow: sample = threshold-1 is accepted", () => {
  const rb = scriptedBytes([u32Bytes(4294967289)]);
  // 4294967289 % 10 === 9
  assertEquals(randomIntBelow(10, rb), 9);
});

Deno.test("randomIntBelow: sample = threshold is rejected then resampled", () => {
  const rb = scriptedBytes([u32Bytes(4294967290), u32Bytes(0)]);
  assertEquals(randomIntBelow(10, rb), 0);
});

Deno.test("randomIntBelow: sample above threshold is rejected then resampled", () => {
  const rb = scriptedBytes([u32Bytes(4294967295), u32Bytes(42)]);
  // 42 % 10 === 2
  assertEquals(randomIntBelow(10, rb), 2);
});

// ---------------- randomIntBelow: max = 2**32 accepts everything ----------------

Deno.test("randomIntBelow(2**32) accepts every 32-bit sample without rejection", () => {
  for (const v of [0, 1, 42, 0x7fffffff, 0xfffffffe, 0xffffffff]) {
    const rb = scriptedBytes([u32Bytes(v)]);
    assertEquals(randomIntBelow(2 ** 32, rb), v);
  }
});

// ---------------- randomIntBelow: max = 1 ----------------

Deno.test("randomIntBelow(1) always returns 0", () => {
  const rb = scriptedBytes([u32Bytes(1234567)]);
  assertEquals(randomIntBelow(1, rb), 0);
});

// ---------------- randomIntBelow: invalid inputs ----------------

Deno.test("randomIntBelow rejects invalid max values", () => {
  assertThrows(() => randomIntBelow(0), RangeError);
  assertThrows(() => randomIntBelow(-1), RangeError);
  assertThrows(() => randomIntBelow(1.5), RangeError);
  assertThrows(() => randomIntBelow(Number.NaN), RangeError);
  assertThrows(() => randomIntBelow(Infinity), RangeError);
  assertThrows(() => randomIntBelow(-Infinity), RangeError);
  assertThrows(() => randomIntBelow(2 ** 32 + 1), RangeError);
});

// ---------------- randomFromAlphabet: deterministic output ----------------
// ROOM_CODE_ALPHABET has length 32 (power of two divides 2**32 evenly), so
// threshold = 2**32 and no sample is rejected — indices map 1:1 from `sample % 32`.

Deno.test("randomFromAlphabet: deterministic under scripted bytes", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const rb = scriptedBytes(indices.map(u32Bytes));
  assertEquals(
    randomFromAlphabet(ROOM_CODE_ALPHABET, 6, rb),
    indices.map((i) => ROOM_CODE_ALPHABET[i]).join(""),
  );
});

Deno.test("randomFromAlphabet: honours full alphabet range", () => {
  const indices = [31, 30, 29, 15, 0, 16];
  const rb = scriptedBytes(indices.map(u32Bytes));
  assertEquals(
    randomFromAlphabet(ROOM_CODE_ALPHABET, indices.length, rb),
    indices.map((i) => ROOM_CODE_ALPHABET[i]).join(""),
  );
});

// ---------------- randomFromAlphabet: invalid inputs ----------------

Deno.test("randomFromAlphabet rejects empty alphabet", () => {
  assertThrows(() => randomFromAlphabet("", 6), RangeError);
});

Deno.test("randomFromAlphabet rejects invalid lengths", () => {
  assertThrows(() => randomFromAlphabet("AB", 0), RangeError);
  assertThrows(() => randomFromAlphabet("AB", -1), RangeError);
  assertThrows(() => randomFromAlphabet("AB", 1.5), RangeError);
  assertThrows(() => randomFromAlphabet("AB", Infinity), RangeError);
  assertThrows(() => randomFromAlphabet("AB", Number.NaN), RangeError);
  assertThrows(() => randomFromAlphabet("AB", 1025), RangeError);
});

// ---------------- generateRoomCode ----------------

Deno.test("generateRoomCode: length is 6 and every char is in the alphabet", () => {
  const code = generateRoomCode();
  assertEquals(code.length, ROOM_CODE_LENGTH);
  for (const ch of code) {
    assert(
      ROOM_CODE_ALPHABET.includes(ch),
      `character ${JSON.stringify(ch)} not in ROOM_CODE_ALPHABET`,
    );
  }
});

Deno.test("generateRoomCode: deterministic under scripted bytes", () => {
  const indices = [31, 0, 15, 24, 7, 12];
  const rb = scriptedBytes(indices.map(u32Bytes));
  assertEquals(
    generateRoomCode(rb),
    indices.map((i) => ROOM_CODE_ALPHABET[i]).join(""),
  );
});

Deno.test("ROOM_CODE_ALPHABET matches expected preserved value", () => {
  assertEquals(ROOM_CODE_ALPHABET, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  assertEquals(ROOM_CODE_ALPHABET.length, 32);
  assertEquals(ROOM_CODE_LENGTH, 6);
});
