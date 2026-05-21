import type { Champion } from "../types/lol"

const VARIANT_ALIAS_PREFIXES = [/^ruby_/i]

function canonicalChampionAlias(alias: string) {
  return VARIANT_ALIAS_PREFIXES.reduce(
    (value, prefix) => value.replace(prefix, ""),
    alias
  )
}

function variantScore(champion: Champion) {
  const alias = champion.alias.toLowerCase()
  if (VARIANT_ALIAS_PREFIXES.some((prefix) => prefix.test(alias))) {
    return 1
  }

  return 0
}

export function normalizeChampionList(champions: Champion[]) {
  const byAlias = new Map<string, Champion & { completionIds: number[] }>()

  for (const champion of champions) {
    if (!champion || champion.id <= 0 || !champion.alias || !champion.name) {
      continue
    }

    const canonicalAlias = canonicalChampionAlias(champion.alias)
    const key = canonicalAlias.toLowerCase()
    const existing = byAlias.get(key)

    if (!existing) {
      byAlias.set(key, {
        ...champion,
        alias: canonicalAlias,
        completionIds: [champion.id],
      })
      continue
    }

    existing.completionIds.push(champion.id)

    const shouldReplace =
      variantScore(champion) < variantScore(existing) ||
      (variantScore(champion) === variantScore(existing) &&
        champion.name.length < existing.name.length)

    if (shouldReplace) {
      byAlias.set(key, {
        ...champion,
        alias: canonicalAlias,
        completionIds: existing.completionIds,
      })
    }
  }

  return Array.from(byAlias.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}
