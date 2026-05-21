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
  return {
    name: raw.name,
    description: raw.description,
    champions: allChamps.map((c) => ({
      ...c,
      done: raw.completedIds.includes(c.id),
    })),
    totalDone: raw.completedIds.length,
  }
}
