import type { Champion } from "../types/lol"

export function normalizeChampionList(champions: Champion[]) {
  const byId = new Map<number, Champion>()

  for (const champion of champions) {
    if (!champion || champion.id <= 0 || !champion.alias || !champion.name) {
      continue
    }

    byId.set(champion.id, champion)
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}
