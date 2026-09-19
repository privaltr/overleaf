function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length]
}

function similarity(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length)
  return maxLength === 0 ? 1 : 1 - levenshtein(a, b) / maxLength
}

function bestTokenScore(term: string, value: string) {
  const tokens = value.match(/[\p{L}\p{N}]+/gu) || []
  let best = 0
  for (const token of tokens) {
    const candidate = normalize(token)
    if (candidate === term) return 1
    if (candidate.startsWith(term)) best = Math.max(best, 0.85)
    best = Math.max(best, similarity(term, candidate))
  }
  return best
}

export function relevanceScore(
  template: { title: string; description: string; content: string },
  query: string
) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const fields = [
    { value: template.title, weight: 8 },
    { value: template.description, weight: 4 },
    { value: template.content, weight: 2 },
  ]

  let score = 0
  for (const { value, weight } of fields) {
    const normalizedValue = normalize(value)
    if (!normalizedValue) continue
    if (normalizedValue === normalizedQuery) score += weight * 100
    else if (normalizedValue.includes(normalizedQuery)) score += weight * 50
    for (const term of normalizedQuery.split(/\s+/).filter(Boolean)) {
      score += bestTokenScore(term, value) * weight * 10
    }
  }
  return score
}
