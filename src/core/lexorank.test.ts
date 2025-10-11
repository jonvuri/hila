import { describe, expect, test } from 'vitest'

import {
  makeKey,
  parseKey,
  between,
  nextPrefix,
  segmentFromBytes,
  bytesFromSegment,
  compareKeys,
} from './lexorank'

describe('Lexorank Encoder Utilities', () => {
  describe('makeKey', () => {
    test('creates key from single segment', () => {
      const segment = new Uint8Array([0x80])
      const key = makeKey([segment])

      expect(key).toEqual(new Uint8Array([0x80, 0x00]))
      expect(key.length).toBe(2)
      expect(key[key.length - 1]).toBe(0x00)
    })

    test('creates key from multiple segments', () => {
      const segments = [new Uint8Array([0x80]), new Uint8Array([0x40]), new Uint8Array([0xc0])]
      const key = makeKey(segments)

      expect(key).toEqual(new Uint8Array([0x80, 0x00, 0x40, 0x00, 0xc0, 0x00]))
      expect(key.length).toBe(6)
    })

    test('throws error if segment contains 0x00', () => {
      const invalidSegment = new Uint8Array([0x80, 0x00, 0x40])

      expect(() => makeKey([invalidSegment])).toThrow('Segment contains invalid 0x00 byte')
    })

    test('handles empty segment array', () => {
      const key = makeKey([])

      expect(key.length).toBe(0)
    })

    test('handles segment with single byte 0x01', () => {
      const segment = new Uint8Array([0x01])
      const key = makeKey([segment])

      expect(key).toEqual(new Uint8Array([0x01, 0x00]))
    })

    test('handles segment with single byte 0xFF', () => {
      const segment = new Uint8Array([0xff])
      const key = makeKey([segment])

      expect(key).toEqual(new Uint8Array([0xff, 0x00]))
    })
  })

  describe('parseKey', () => {
    test('parses single-segment key', () => {
      const key = new Uint8Array([0x80, 0x00])
      const segments = parseKey(key)

      expect(segments.length).toBe(1)
      expect(segments[0]).toEqual(new Uint8Array([0x80]))
    })

    test('parses multi-segment key', () => {
      const key = new Uint8Array([0x80, 0x00, 0x40, 0x00, 0xc0, 0x00])
      const segments = parseKey(key)

      expect(segments.length).toBe(3)
      expect(segments[0]).toEqual(new Uint8Array([0x80]))
      expect(segments[1]).toEqual(new Uint8Array([0x40]))
      expect(segments[2]).toEqual(new Uint8Array([0xc0]))
    })

    test('parses key with multi-byte segments', () => {
      const key = new Uint8Array([0x80, 0x90, 0xa0, 0x00, 0x40, 0x50, 0x00])
      const segments = parseKey(key)

      expect(segments.length).toBe(2)
      expect(segments[0]).toEqual(new Uint8Array([0x80, 0x90, 0xa0]))
      expect(segments[1]).toEqual(new Uint8Array([0x40, 0x50]))
    })

    test('round-trip: makeKey -> parseKey', () => {
      const originalSegments = [
        new Uint8Array([0x80, 0x90]),
        new Uint8Array([0x40]),
        new Uint8Array([0xc0, 0xd0, 0xe0]),
      ]
      const key = makeKey(originalSegments)
      const parsedSegments = parseKey(key)

      expect(parsedSegments.length).toBe(originalSegments.length)
      for (let i = 0; i < originalSegments.length; i++) {
        expect(parsedSegments[i]).toEqual(originalSegments[i])
      }
    })
  })

  describe('compareKeys', () => {
    test('equal keys return 0', () => {
      const key = new Uint8Array([0x80, 0x00])
      expect(compareKeys(key, key)).toBe(0)
    })

    test('lexicographically smaller key returns -1', () => {
      const a = new Uint8Array([0x80, 0x00])
      const b = new Uint8Array([0x81, 0x00])
      expect(compareKeys(a, b)).toBe(-1)
    })

    test('lexicographically larger key returns 1', () => {
      const a = new Uint8Array([0x81, 0x00])
      const b = new Uint8Array([0x80, 0x00])
      expect(compareKeys(a, b)).toBe(1)
    })

    test('shorter key that is prefix returns -1', () => {
      const a = new Uint8Array([0x80, 0x00])
      const b = new Uint8Array([0x80, 0x00, 0x40, 0x00])
      expect(compareKeys(a, b)).toBe(-1)
    })

    test('longer key with same prefix returns 1', () => {
      const a = new Uint8Array([0x80, 0x00, 0x40, 0x00])
      const b = new Uint8Array([0x80, 0x00])
      expect(compareKeys(a, b)).toBe(1)
    })
  })

  describe('Ordering Properties', () => {
    test('keys sort in lexicographic order', () => {
      const keys = [
        makeKey([new Uint8Array([0xc0])]),
        makeKey([new Uint8Array([0x40])]),
        makeKey([new Uint8Array([0x80])]),
        makeKey([new Uint8Array([0x20])]),
        makeKey([new Uint8Array([0xe0])]),
      ]

      const sorted = [...keys].sort(compareKeys)

      expect(sorted[0]).toEqual(makeKey([new Uint8Array([0x20])]))
      expect(sorted[1]).toEqual(makeKey([new Uint8Array([0x40])]))
      expect(sorted[2]).toEqual(makeKey([new Uint8Array([0x80])]))
      expect(sorted[3]).toEqual(makeKey([new Uint8Array([0xc0])]))
      expect(sorted[4]).toEqual(makeKey([new Uint8Array([0xe0])]))
    })

    test('parent keys are prefixes of child keys', () => {
      const parent = makeKey([new Uint8Array([0x80])])
      const child = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])

      // Verify parent is prefix of child
      for (let i = 0; i < parent.length; i++) {
        expect(child[i]).toBe(parent[i])
      }
    })

    test('parent sorts before children', () => {
      const parent = makeKey([new Uint8Array([0x80])])
      const child1 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])
      const child2 = makeKey([new Uint8Array([0x80]), new Uint8Array([0xc0])])

      expect(compareKeys(parent, child1)).toBe(-1)
      expect(compareKeys(parent, child2)).toBe(-1)
      expect(compareKeys(child1, child2)).toBe(-1)
    })

    test('siblings at same depth sort correctly', () => {
      const sibling1 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])
      const sibling2 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x80])])
      const sibling3 = makeKey([new Uint8Array([0x80]), new Uint8Array([0xc0])])

      expect(compareKeys(sibling1, sibling2)).toBe(-1)
      expect(compareKeys(sibling2, sibling3)).toBe(-1)
      expect(compareKeys(sibling1, sibling3)).toBe(-1)
    })

    test('variable-length siblings sort correctly', () => {
      const short = makeKey([new Uint8Array([0x80])])
      const long = makeKey([new Uint8Array([0x80, 0x80])])
      const veryLong = makeKey([new Uint8Array([0x80, 0x80, 0x80])])

      expect(compareKeys(short, long)).toBe(-1)
      expect(compareKeys(long, veryLong)).toBe(-1)
    })
  })

  describe('between', () => {
    test('creates key between two simple keys', () => {
      const a = makeKey([new Uint8Array([0x40])])
      const b = makeKey([new Uint8Array([0xc0])])
      const mid = between(a, b)

      expect(compareKeys(a, mid)).toBe(-1)
      expect(compareKeys(mid, b)).toBe(-1)
    })

    test('creates initial key when both are empty', () => {
      const key = between(new Uint8Array([]), new Uint8Array([]))

      expect(key).toEqual(new Uint8Array([0x80, 0x00]))
    })

    test('inserts at start when first is empty', () => {
      const b = makeKey([new Uint8Array([0x80])])
      const result = between(new Uint8Array([]), b)

      expect(compareKeys(result, b)).toBe(-1)
    })

    test('inserts at end when second is empty', () => {
      const a = makeKey([new Uint8Array([0x80])])
      const result = between(a, new Uint8Array([]))

      expect(compareKeys(a, result)).toBe(-1)
    })

    test('extends segment when no room at current length', () => {
      // Example from documentation: keys [0x80, 0x00] and [0x81, 0x00]
      const a = makeKey([new Uint8Array([0x80])])
      const b = makeKey([new Uint8Array([0x81])])
      const mid = between(a, b)

      // mid should be longer (extended segment)
      expect(mid.length).toBeGreaterThan(a.length)
      expect(compareKeys(a, mid)).toBe(-1)
      expect(compareKeys(mid, b)).toBe(-1)
    })

    test('repeated insertions work correctly', () => {
      const a = makeKey([new Uint8Array([0x80])])
      const b = makeKey([new Uint8Array([0x81])])

      const mid1 = between(a, b)
      const mid2 = between(a, mid1)

      // Verify order: a < mid2 < mid1 < b
      expect(compareKeys(a, mid2)).toBe(-1)
      expect(compareKeys(mid2, mid1)).toBe(-1)
      expect(compareKeys(mid1, b)).toBe(-1)
    })

    test('inserts between parent and child', () => {
      const parent = makeKey([new Uint8Array([0x80])])
      const child = makeKey([new Uint8Array([0x80]), new Uint8Array([0x80])])
      const mid = between(parent, child)

      expect(compareKeys(parent, mid)).toBe(-1)
      expect(compareKeys(mid, child)).toBe(-1)

      // mid should be a child of parent
      for (let i = 0; i < parent.length; i++) {
        expect(mid[i]).toBe(parent[i])
      }
    })

    test('inserts between siblings with same parent', () => {
      const sibling1 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x80])])
      const sibling2 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x81])])
      const mid = between(sibling1, sibling2)

      expect(compareKeys(sibling1, mid)).toBe(-1)
      expect(compareKeys(mid, sibling2)).toBe(-1)

      // mid should share parent prefix
      const parent = makeKey([new Uint8Array([0x80])])
      for (let i = 0; i < parent.length; i++) {
        expect(mid[i]).toBe(parent[i])
      }
    })

    test('handles multi-segment keys', () => {
      const a = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])
      const b = makeKey([new Uint8Array([0x80]), new Uint8Array([0xc0])])
      const mid = between(a, b)

      expect(compareKeys(a, mid)).toBe(-1)
      expect(compareKeys(mid, b)).toBe(-1)
    })

    test('between produces unique keys in sequence', () => {
      const a = makeKey([new Uint8Array([0x40])])
      let b = makeKey([new Uint8Array([0xc0])])

      const keys = [a, b]

      // Insert 10 keys between a and b
      for (let i = 0; i < 10; i++) {
        const mid = between(a, b)
        keys.push(mid)
        b = mid // Next insertion between a and new mid
      }

      // Sort and verify all are unique and ordered
      const sorted = [...keys].sort(compareKeys)
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(compareKeys(sorted[i]!, sorted[i + 1]!)).toBe(-1)
      }
    })
  })

  describe('nextPrefix', () => {
    test('increments final terminator from 0x00 to 0x01', () => {
      const key = makeKey([new Uint8Array([0x80])])
      const next = nextPrefix(key)

      expect(next.length).toBe(key.length)
      expect(next[next.length - 1]).toBe(0x01)
      // All other bytes should be the same
      for (let i = 0; i < next.length - 1; i++) {
        expect(next[i]).toBe(key[i])
      }
    })

    test('defines subtree upper bound', () => {
      const parent = makeKey([new Uint8Array([0x80])])
      const child1 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])
      const child2 = makeKey([new Uint8Array([0x80]), new Uint8Array([0x80])])
      const child3 = makeKey([new Uint8Array([0x80]), new Uint8Array([0xff])])
      const nextSibling = makeKey([new Uint8Array([0x81])])

      const upperBound = nextPrefix(parent)

      // All children should be >= parent and < upperBound
      expect(compareKeys(parent, child1)).toBe(-1)
      expect(compareKeys(child1, upperBound)).toBe(-1)

      expect(compareKeys(parent, child2)).toBe(-1)
      expect(compareKeys(child2, upperBound)).toBe(-1)

      expect(compareKeys(parent, child3)).toBe(-1)
      expect(compareKeys(child3, upperBound)).toBe(-1)

      // Next sibling should be >= upperBound
      expect(compareKeys(upperBound, nextSibling)).toBeLessThanOrEqual(0)
    })

    test('works with multi-segment keys', () => {
      const key = makeKey([new Uint8Array([0x80]), new Uint8Array([0x40])])
      const next = nextPrefix(key)

      expect(next.length).toBe(key.length)
      expect(next[next.length - 1]).toBe(0x01)
    })

    test('throws error for empty key', () => {
      expect(() => nextPrefix(new Uint8Array([]))).toThrow('Cannot get nextPrefix of empty key')
    })

    test('throws error if key does not end with 0x00', () => {
      const invalidKey = new Uint8Array([0x80, 0x40])
      expect(() => nextPrefix(invalidKey)).toThrow('Key must end with 0x00 terminator')
    })

    test('does not mutate input', () => {
      const key = makeKey([new Uint8Array([0x80])])
      const original = new Uint8Array(key)
      nextPrefix(key)

      expect(key).toEqual(original)
    })
  })

  describe('segmentFromBytes and bytesFromSegment', () => {
    test('encodes bytes without 0x00', () => {
      const input = new Uint8Array([0x80, 0x90, 0xa0])
      const segment = segmentFromBytes(input)

      expect(segment).toEqual(input)
      expect(segment.every((b) => b !== 0x00)).toBe(true)
    })

    test('encodes 0x00 as 0x01 0x01', () => {
      const input = new Uint8Array([0x80, 0x00, 0x90])
      const segment = segmentFromBytes(input)

      expect(segment).toEqual(new Uint8Array([0x80, 0x01, 0x01, 0x90]))
      expect(segment.every((b) => b !== 0x00)).toBe(true)
    })

    test('encodes multiple 0x00 bytes', () => {
      const input = new Uint8Array([0x00, 0x80, 0x00, 0x00, 0x90])
      const segment = segmentFromBytes(input)

      expect(segment).toEqual(new Uint8Array([0x01, 0x01, 0x80, 0x01, 0x01, 0x01, 0x01, 0x90]))
    })

    test('round-trip: segmentFromBytes -> bytesFromSegment', () => {
      const original = new Uint8Array([0x00, 0x01, 0x80, 0x00, 0xff, 0x00])
      const encoded = segmentFromBytes(original)
      const decoded = bytesFromSegment(encoded)

      expect(decoded).toEqual(original)
    })

    test('decodes segment without encoded nulls', () => {
      const segment = new Uint8Array([0x80, 0x90, 0xa0])
      const bytes = bytesFromSegment(segment)

      expect(bytes).toEqual(segment)
    })

    test('handles empty input', () => {
      const empty = new Uint8Array([])
      const encoded = segmentFromBytes(empty)
      const decoded = bytesFromSegment(encoded)

      expect(encoded.length).toBe(0)
      expect(decoded.length).toBe(0)
    })

    test('encoded segment can be used in makeKey', () => {
      const input = new Uint8Array([0x00, 0x80, 0x00])
      const segment = segmentFromBytes(input)
      const key = makeKey([segment])

      // Should not throw
      expect(key.length).toBeGreaterThan(0)
      expect(key[key.length - 1]).toBe(0x00)
    })
  })

  describe('Edge Cases', () => {
    test('single-byte segment at minimum', () => {
      const key = makeKey([new Uint8Array([0x01])])
      expect(key).toEqual(new Uint8Array([0x01, 0x00]))
    })

    test('single-byte segment at maximum', () => {
      const key = makeKey([new Uint8Array([0xff])])
      expect(key).toEqual(new Uint8Array([0xff, 0x00]))
    })

    test('long key with many segments', () => {
      const segments = Array.from({ length: 10 }, (_, i) => new Uint8Array([0x80 + i]))
      const key = makeKey(segments)

      expect(key.length).toBe(20) // 10 segments * 2 bytes each
      expect(parseKey(key).length).toBe(10)
    })

    test('between handles adjacent bytes at boundaries', () => {
      const a = makeKey([new Uint8Array([0xfe])])
      const b = makeKey([new Uint8Array([0xff])])
      const mid = between(a, b)

      expect(compareKeys(a, mid)).toBe(-1)
      expect(compareKeys(mid, b)).toBe(-1)
    })

    test('between at lower boundary', () => {
      const a = makeKey([new Uint8Array([0x01])])
      const b = makeKey([new Uint8Array([0x02])])
      const mid = between(a, b)

      expect(compareKeys(a, mid)).toBe(-1)
      expect(compareKeys(mid, b)).toBe(-1)
    })

    test('large key hierarchy', () => {
      // Create a deep hierarchy
      let current = makeKey([new Uint8Array([0x80])])
      const hierarchy = [current]

      for (let i = 0; i < 5; i++) {
        const segments = parseKey(current)
        segments.push(new Uint8Array([0x80]))
        current = makeKey(segments)
        hierarchy.push(current)
      }

      // Verify each level sorts correctly
      for (let i = 0; i < hierarchy.length - 1; i++) {
        expect(compareKeys(hierarchy[i]!, hierarchy[i + 1]!)).toBe(-1)
      }
    })

    test('between with maximum byte values', () => {
      const a = makeKey([new Uint8Array([0xff, 0xff])])
      const b = between(a, new Uint8Array([]))

      expect(compareKeys(a, b)).toBe(-1)
    })
  })
})
