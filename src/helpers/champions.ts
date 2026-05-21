import type { Champion } from "../types/lol"

type CanonicalChampion = {
  alias: string
  name: string
}

function championKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function buildCanonicalChampionMap(champions: Champion[]) {
  const canonicalByKey = new Map<string, CanonicalChampion>()

  for (const champion of champions) {
    if (!isValidChampion(champion) || champion.alias.includes("_")) {
      continue
    }

    const canonical = {
      alias: champion.alias,
      name: champion.name,
    }

    canonicalByKey.set(championKey(champion.alias), canonical)
    canonicalByKey.set(championKey(champion.name), canonical)
  }

  return canonicalByKey
}

function isValidChampion(champion: Champion | undefined): champion is Champion {
  return Boolean(champion?.id && champion.id > 0 && champion.alias && champion.name)
}

function canonicalChampionForAlias(
  alias: string,
  canonicalByKey: Map<string, CanonicalChampion>
) {
  const exact = canonicalByKey.get(championKey(alias))
  if (exact) return exact

  const underscoreIndexes = Array.from(alias.matchAll(/_/g), (match) => match.index)
    .filter((index): index is number => index !== undefined)

  for (const index of underscoreIndexes) {
    const suffix = alias.slice(index + 1)
    const canonical = canonicalByKey.get(championKey(suffix))
    if (canonical) {
      return canonical
    }
  }

  return null
}

function variantScore(champion: Champion, canonicalAlias: string) {
  if (championKey(champion.alias) === championKey(canonicalAlias)) {
    return 0
  }

  if (championKey(champion.name) === championKey(canonicalAlias)) {
    return 1
  }

  return 2
}

export function normalizeChampionList(champions: Champion[]) {
  const byAlias = new Map<string, Champion & { completionIds: number[] }>()
  const canonicalByKey = buildCanonicalChampionMap(champions)

  for (const champion of champions) {
    if (!isValidChampion(champion)) {
      continue
    }

    const canonicalChampion = canonicalChampionForAlias(
      champion.alias,
      canonicalByKey
    )
    const canonicalAlias = canonicalChampion?.alias ?? champion.alias
    const canonicalName = canonicalChampion?.name ?? champion.name
    const key = canonicalAlias.toLowerCase()
    const existing = byAlias.get(key)

    if (!existing) {
      byAlias.set(key, {
        ...champion,
        alias: canonicalAlias,
        name: canonicalName,
        completionIds: [champion.id],
      })
      continue
    }

    existing.completionIds.push(champion.id)

    const shouldReplace =
      variantScore(champion, canonicalAlias) < variantScore(existing, canonicalAlias) ||
      (variantScore(champion, canonicalAlias) === variantScore(existing, canonicalAlias) &&
        champion.name.length < existing.name.length)

    if (shouldReplace) {
      byAlias.set(key, {
        ...champion,
        alias: canonicalAlias,
        name: canonicalName,
        completionIds: existing.completionIds,
      })
    }
  }

  return Array.from(byAlias.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}
