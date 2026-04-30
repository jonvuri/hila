/**
 * Generates a deterministic HSL color from a tag type name.
 * Used as fallback when no explicit color is set on a tag type.
 */
export const tagColorFromName = (name: string): string => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 55%, 48%)`
}

/**
 * Returns a lighter background tint derived from the badge text color.
 * Accepts either an explicit hex/named color or an HSL string.
 */
export const tagBadgeBackground = (color: string): string => {
  const hslMatch = color.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/)
  if (hslMatch) {
    return `hsl(${hslMatch[1]}, ${hslMatch[2]}%, 93%)`
  }
  // For hex colors, derive a tinted background via CSS color-mix
  return `color-mix(in srgb, ${color} 12%, white)`
}
