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

  it("merges prefixed LCU variants when the suffix is a canonical champion alias", () => {
    const result = normalizeChampionList([
      champion(99, "Lux", "Lux"),
      champion(90099, "Lux", "ruby_Lux"),
      champion(90, "Malzahar", "Malzahar"),
      champion(90090, "Malzahar", "arena_event_Malzahar"),
    ])

    expect(result.map((champion) => champion.alias)).toEqual([
      "Lux",
      "Malzahar",
    ])
    expect(result[0].completionIds).toEqual([99, 90099])
    expect(result[1].completionIds).toEqual([90, 90090])
  })

  it("matches variant suffixes against champion display names too", () => {
    const result = normalizeChampionList([
      champion(62, "Wukong", "MonkeyKing"),
      champion(9062, "Wukong", "ruby_Wukong"),
      champion(36, "Dr. Mundo", "DrMundo"),
      champion(9036, "Dr. Mundo", "ruby_DrMundo"),
    ])

    expect(result.map((champion) => champion.alias)).toEqual([
      "DrMundo",
      "MonkeyKing",
    ])
    expect(result[0].completionIds).toEqual([36, 9036])
    expect(result[1].completionIds).toEqual([62, 9062])
  })

  it("does not merge underscored aliases unless the suffix is a real champion", () => {
    const result = normalizeChampionList([
      champion(1, "Lux", "Lux"),
      champion(2, "Arena Special", "ruby_NotAChampion"),
    ])

    expect(result.map((champion) => champion.alias).sort()).toEqual([
      "Lux",
      "ruby_NotAChampion",
    ])
  })
})
