import { describe, expect, it } from "vitest"
import { normalizeChampionList } from "./champions"
import type { Champion } from "../types/lol"

function champion(id: number, name: string, alias = name): Champion {
  return {
    id,
    name,
    alias,
    roles: ["fighter"],
  }
}

describe("normalizeChampionList", () => {
  it("drops invalid placeholders without relying on array position", () => {
    const result = normalizeChampionList([
      champion(0, "None"),
      champion(67, "Vayne"),
      champion(99, "Lux"),
    ])

    expect(result.map((champion) => champion.name)).toEqual(["Lux", "Vayne"])
  })

  it("deduplicates by champion id without merging unrelated names", () => {
    const result = normalizeChampionList([
      champion(1, "Nunu & Willump", "Nunu"),
      champion(2, "Nautilus"),
      champion(1, "Nunu & Willump", "Nunu"),
    ])

    expect(result.map((champion) => champion.name)).toEqual([
      "Nautilus",
      "Nunu & Willump",
    ])
  })
})
