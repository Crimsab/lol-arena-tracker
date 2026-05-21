import { RawChallenge } from "../types/lcu"
import { Challenge, Champion } from "../types/lol"

export async function makeLCURequest<T = any>(
  path: string
): Promise<T> {
  return window.arenaAPI.lcuRequest<T>(path)
}

export function challengeFromCompletedIds(
  raw: RawChallenge,
  allChamps: Champion[]
): Challenge {
  const completedIds = new Set(raw.completedIds)
  const champions = allChamps.map((champion) => {
    const completionIds = champion.completionIds ?? [champion.id]
    return {
      ...champion,
      done: completionIds.some((id) => completedIds.has(id)),
    }
  })

  return {
    name: raw.name,
    description: raw.description,
    champions,
    totalDone: champions.filter((champion) => champion.done).length,
  }
}
