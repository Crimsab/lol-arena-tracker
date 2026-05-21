import { describe, expect, it } from "vitest"
import { challengeFromCompletedIds } from "./utils"
import type { Champion } from "../types/lol"

const champions: Champion[] = [
  { id: 1, name: "Annie", alias: "Annie", roles: ["mage"] },
  { id: 99, name: "Lux", alias: "Lux", roles: ["mage"] },
]

describe("challengeFromCompletedIds", () => {
  it("maps completed ids onto Arena champions", () => {
    const challenge = challengeFromCompletedIds(
      {
        name: "Adapt to All Situations",
        description: "Win Arena games with different champions",
        completedIds: [99],
      },
      champions
    )

    expect(challenge.totalDone).toBe(1)
    expect(challenge.champions).toEqual([
      { ...champions[0], done: false },
      { ...champions[1], done: true },
    ])
  })
})
