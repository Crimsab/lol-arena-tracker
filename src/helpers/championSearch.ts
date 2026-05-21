import type { Champion } from "../types/lol"

type ChampionWithCompletion = Champion & { done: boolean }

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

function rankChampion(champion: ChampionWithCompletion, query: string) {
  const name = normalizeSearchValue(champion.name)
  const alias = normalizeSearchValue(champion.alias)

  if (name === query || alias === query) return 0
  if (name.startsWith(query) || alias.startsWith(query)) return 1

  const words = name.split(/[\s'-]+/)
  if (words.some((word) => word.startsWith(query))) return 2

  if (query.length >= 3 && (name.includes(query) || alias.includes(query))) {
    return 3
  }

  return Number.POSITIVE_INFINITY
}

export function filterAndRankChampions(
  champions: ChampionWithCompletion[],
  rawQuery: string
) {
  const query = normalizeSearchValue(rawQuery)
  if (!query) return champions

  return champions
    .map((champion, index) => ({
      champion,
      index,
      rank: rankChampion(champion, query),
    }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.champion)
}
