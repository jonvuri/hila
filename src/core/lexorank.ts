/**
 * Lexorank Encoder Utilities
 *
 * Implements 0x00-terminated, variable-length segment keys for global element ordering.
 *
 * Key properties:
 * - Segment content bytes: 0x01..0xFF (never 0x00)
 * - Terminator: each segment ends with a single 0x00
 * - Key: concatenation of one or more terminated segments
 * - Natural sort: plain lexicographic BLOB order over the key equals outline order
 * - Parent/child relation: a parent's key is a strict prefix ending in 0x00; a child appends another terminated segment
 */

/**
 * Creates a Lexorank key from an array of segments.
 *
 * Each segment is terminated with 0x00. Validates that segments only contain bytes 0x01-0xFF.
 *
 * @param segments - Array of segments (each should only contain bytes 0x01-0xFF)
 * @returns Complete Lexorank key with terminators
 * @throws Error if any segment contains 0x00 bytes
 */
export const makeKey = (segments: Uint8Array[]): Uint8Array => {
  // Calculate total length: sum of segment lengths + one terminator per segment
  const totalLength = segments.reduce((acc, seg) => acc + seg.length + 1, 0)
  const key = new Uint8Array(totalLength)

  let offset = 0
  for (const segment of segments) {
    // Validate segment contains no 0x00 bytes
    for (let i = 0; i < segment.length; i++) {
      if (segment[i] === 0x00) {
        throw new Error('Segment contains invalid 0x00 byte')
      }
    }

    // Copy segment and add terminator
    key.set(segment, offset)
    offset += segment.length
    key[offset] = 0x00
    offset++
  }

  return key
}

/**
 * Parses a Lexorank key into its constituent segments.
 *
 * Splits on 0x00 terminators and returns array of segments (without terminators).
 *
 * @param key - Complete Lexorank key
 * @returns Array of segments (without terminators)
 */
export const parseKey = (key: Uint8Array): Uint8Array[] => {
  const segments: Uint8Array[] = []
  let start = 0

  for (let i = 0; i < key.length; i++) {
    if (key[i] === 0x00) {
      // Found terminator, extract segment
      if (i > start) {
        segments.push(key.slice(start, i))
      }
      start = i + 1
    }
  }

  return segments
}

/**
 * Generates a key that sorts lexicographically between keys `a` and `b`.
 *
 * This implements fractional indexing by finding a midpoint byte value. When no room exists
 * at the current length (e.g., inserting between [0x80, 0x00] and [0x81, 0x00]), the function
 * extends the segment length.
 *
 * **Why extending only the new segment is sufficient:**
 *
 * Variable-length segments don't break sorting because lexicographic comparison works byte-by-byte,
 * and a shorter sequence is always less than a longer sequence when the shorter one is a prefix.
 *
 * **Example 1: Basic insertion with no room**
 * ```
 * Key A: [0x80, 0x00]              → segment: {0x80}
 * Key B: [0x81, 0x00]              → segment: {0x81}
 * Problem: No byte between 0x80 and 0x81 at length 1
 *
 * Solution - New key: [0x80, 0x80, 0x00]  → segment: {0x80, 0x80}
 *
 * Order:
 * [0x80, 0x00]         < [0x80, 0x80, 0x00] < [0x81, 0x00]
 *  └─ byte 0: 0x80       └─ byte 0: 0x80      └─ byte 0: 0x81
 *  └─ byte 1: 0x00       └─ byte 1: 0x80      └─ byte 1: 0x00
 *     (shorter prefix    (longer, so > A)     (0x81 > 0x80)
 *      sorts first)
 * ```
 *
 * **Example 2: Repeated insertions requiring further extension**
 * ```
 * Starting:
 *   A: [0x80, 0x00]
 *   B: [0x81, 0x00]
 *
 * First insertion → New1: [0x80, 0x80, 0x00]
 * Second insertion between A and New1 → New2: [0x80, 0x40, 0x00]
 *
 * Final order:
 *   [0x80, 0x00]         A
 *   [0x80, 0x40, 0x00]   New2  (0x40 < 0x80 at byte 1)
 *   [0x80, 0x80, 0x00]   New1
 *   [0x81, 0x00]         B
 * ```
 *
 * **Example 3: Multi-segment keys (parent-child relationships)**
 * ```
 * Parent:  [0x80, 0x00]
 * Child1:  [0x80, 0x00, 0x80, 0x00]
 * Child2:  [0x80, 0x00, 0x81, 0x00]
 *
 * Insert between Child1 and Child2:
 * New: [0x80, 0x00, 0x80, 0x80, 0x00]  (second segment extended)
 *
 * Order:
 *   [0x80, 0x00]                    Parent
 *   [0x80, 0x00, 0x80, 0x00]        Child1
 *   [0x80, 0x00, 0x80, 0x80, 0x00]  New (0x80,0x80 < 0x81)
 *   [0x80, 0x00, 0x81, 0x00]        Child2
 * ```
 *
 * @param a - First key (or empty Uint8Array to insert at start)
 * @param b - Second key (or empty Uint8Array to insert at end)
 * @returns New key that sorts between a and b
 */
export const between = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  // Handle edge cases
  if (a.length === 0 && b.length === 0) {
    // Both empty: create initial key
    return new Uint8Array([0x80, 0x00]) // Midpoint segment + terminator
  }

  if (a.length === 0) {
    // Insert at start: create key less than b
    if (b.length === 0) {
      throw new Error('Cannot insert when both keys are empty (handled earlier)')
    }
    const firstByte = b[0]!
    if (firstByte > 0x01) {
      // Room before first byte of b
      return new Uint8Array([Math.floor(firstByte / 2), 0x00])
    } else {
      // No room, need to extend: use 0x01 with additional byte
      return new Uint8Array([0x01, 0x80, 0x00])
    }
  }

  if (b.length === 0) {
    // Insert at end: create key greater than a
    // Strategy: find the last byte before the terminator and try to increment it
    // If it's 0xff, extend the segment
    if (a.length < 2) {
      throw new Error('Invalid key: must have at least one byte plus terminator')
    }
    const lastByteIndex = a.length - 2 // Last byte before terminator
    const lastByte = a[lastByteIndex]!

    if (lastByte < 0xff) {
      // Room to increment last byte
      const result = new Uint8Array(a.length)
      result.set(a)
      result[lastByteIndex] = lastByte + Math.floor((0xff - lastByte) / 2) + 1
      return result
    } else {
      // Last byte is 0xff, need to extend the segment
      const result = new Uint8Array(a.length + 1)
      result.set(a.slice(0, a.length - 1)) // Copy without terminator
      result[a.length - 1] = 0x80 // Add new byte
      result[a.length] = 0x00 // Add terminator
      return result
    }
  }

  // Both non-empty: find first difference
  const minLen = Math.min(a.length, b.length)
  let diffIndex = 0

  while (diffIndex < minLen && a[diffIndex] === b[diffIndex]) {
    diffIndex++
  }

  // If we've matched up to a terminator, we're at a parent-child boundary
  if (diffIndex < a.length && a[diffIndex] === 0x00) {
    // a is a prefix of b (parent-child relationship)
    // Insert as a child of a, before b's next segment
    const bNextByte = diffIndex < b.length ? b[diffIndex]! : 0x00

    if (bNextByte > 0x01) {
      // Room before b's next segment
      const result = new Uint8Array(diffIndex + 2) // a's prefix + new byte + terminator
      result.set(a.slice(0, diffIndex + 1)) // Include a's terminator
      result[diffIndex + 1] = Math.floor(bNextByte / 2)
      result[diffIndex + 2] = 0x00
      return result
    } else {
      // Need to extend
      const result = new Uint8Array(diffIndex + 3)
      result.set(a.slice(0, diffIndex + 1))
      result[diffIndex + 1] = 0x01
      result[diffIndex + 2] = 0x80
      result[diffIndex + 3] = 0x00
      return result
    }
  }

  if (diffIndex < b.length && b[diffIndex] === 0x00) {
    // b is a prefix of a - shouldn't happen in well-formed trees, but handle it
    throw new Error('Invalid ordering: second key is prefix of first key')
  }

  // Both have different bytes at diffIndex
  const aByte = diffIndex < a.length ? a[diffIndex]! : 0x00
  const bByte = diffIndex < b.length ? b[diffIndex]! : 0x00

  if (bByte - aByte > 1) {
    // Room for a byte in between
    const result = new Uint8Array(diffIndex + 2)
    result.set(a.slice(0, diffIndex))
    result[diffIndex] = aByte + Math.floor((bByte - aByte) / 2)
    result[diffIndex + 1] = 0x00
    return result
  }

  // No room at current length, need to extend
  // Find the end of the current segment in a
  let segmentEnd = diffIndex
  while (segmentEnd < a.length && a[segmentEnd] !== 0x00) {
    segmentEnd++
  }

  // Create extended key: copy up to segment end, add extension
  const result = new Uint8Array(segmentEnd + 2) // segment + new byte + terminator
  result.set(a.slice(0, segmentEnd))
  result[segmentEnd] = 0x80 // Midpoint for extension
  result[segmentEnd + 1] = 0x00
  return result
}

/**
 * Increments the final 0x00 terminator to 0x01 to define subtree upper bound.
 *
 * For a node key P, the subtree is [P, nextPrefix(P)), where nextPrefix(P) is P with its
 * final 0x00 incremented to 0x01. All descendants of P sort in this range because they
 * have P as a prefix followed by additional segments.
 *
 * Example:
 * ```
 * Parent key: [0x80, 0x00]
 * nextPrefix: [0x80, 0x01]
 *
 * All descendants have prefix [0x80, 0x00]:
 *   [0x80, 0x00, 0x40, 0x00]  - child 1
 *   [0x80, 0x00, 0x80, 0x00]  - child 2
 *   [0x80, 0x00, 0xFF, 0x00]  - child 3
 *
 * All sort in range [0x80, 0x00] <= x < [0x80, 0x01]
 * ```
 *
 * @param prefix - Parent key
 * @returns Upper bound for subtree query
 * @throws Error if key doesn't end with 0x00
 */
export const nextPrefix = (prefix: Uint8Array): Uint8Array => {
  if (prefix.length === 0) {
    throw new Error('Cannot get nextPrefix of empty key')
  }

  if (prefix[prefix.length - 1] !== 0x00) {
    throw new Error('Key must end with 0x00 terminator')
  }

  // Create copy and increment final byte
  const result = new Uint8Array(prefix)
  result[result.length - 1] = 0x01

  return result
}

/**
 * Creates a valid segment from arbitrary bytes by encoding to avoid 0x00.
 *
 * Maps 0x00 → 0x01 0x01, other bytes → themselves. This allows creating keys from
 * strings or other data that might contain null bytes.
 *
 * Note: This is a simple encoding scheme. For production use, consider a more efficient
 * encoding like COBS (Consistent Overhead Byte Stuffing).
 *
 * @param bytes - Arbitrary input bytes
 * @returns Valid segment (no 0x00 bytes)
 */
export const segmentFromBytes = (bytes: Uint8Array): Uint8Array => {
  // Count 0x00 bytes to determine output size
  let nullCount = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x00) {
      nullCount++
    }
  }

  // Allocate result array
  const result = new Uint8Array(bytes.length + nullCount)
  let writePos = 0

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x00) {
      // Encode 0x00 as 0x01 0x01
      result[writePos++] = 0x01
      result[writePos++] = 0x01
    } else {
      result[writePos++] = bytes[i]!
    }
  }

  return result
}

/**
 * Decodes a segment created by segmentFromBytes back to original bytes.
 *
 * Maps 0x01 0x01 → 0x00, other bytes → themselves.
 *
 * @param segment - Encoded segment
 * @returns Original bytes
 */
export const bytesFromSegment = (segment: Uint8Array): Uint8Array => {
  // Count encoded nulls (0x01 0x01 pairs)
  let encodedNullCount = 0
  for (let i = 0; i < segment.length - 1; i++) {
    if (segment[i] === 0x01 && segment[i + 1] === 0x01) {
      encodedNullCount++
      i++ // Skip next byte
    }
  }

  // Allocate result array
  const result = new Uint8Array(segment.length - encodedNullCount)
  let writePos = 0

  for (let i = 0; i < segment.length; i++) {
    if (i < segment.length - 1 && segment[i] === 0x01 && segment[i + 1] === 0x01) {
      // Decode 0x01 0x01 as 0x00
      result[writePos++] = 0x00
      i++ // Skip next byte
    } else {
      result[writePos++] = segment[i]!
    }
  }

  return result
}

/**
 * Compares two keys lexicographically.
 *
 * @param a - First key
 * @param b - Second key
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export const compareKeys = (a: Uint8Array, b: Uint8Array): number => {
  const minLen = Math.min(a.length, b.length)

  for (let i = 0; i < minLen; i++) {
    const aByte = a[i]!
    const bByte = b[i]!
    if (aByte < bByte) return -1
    if (aByte > bByte) return 1
  }

  // All bytes equal up to minLen
  if (a.length < b.length) return -1
  if (a.length > b.length) return 1
  return 0
}
