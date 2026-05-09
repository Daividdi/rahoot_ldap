const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di', 'del', 'van', 'von'])

export function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 2) return fullName.trim()

  const first = parts[0]
  const last = parts[parts.length - 1]

  // Collect particles immediately preceding the last surname
  const prefix: string[] = []
  let i = parts.length - 2
  while (i > 0 && PARTICLES.has(parts[i].toLowerCase())) {
    prefix.unshift(parts[i])
    i--
  }

  return prefix.length > 0
    ? `${first} ${prefix.join(' ')} ${last}`
    : `${first} ${last}`
}
