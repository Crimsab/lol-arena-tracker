import { describe, expect, it } from "vitest"
import { filterAndRankChampions } from "./championSearch"
import type { Champion } from "../types/lol"

function champ(name: string, alias = name): Champion & { done: boolean } {
  return {
    id: name.length,
    name,
    alias,
    roles: ["mage"],
    done: false,
  }
}

describe("filterAndRankChampions", () => {
  const champions = [
    champ("Lucian"),
    champ("Lulu"),
    champ("Lux"),
    champ("Nautilus"),
    champ("Nunu & Willump", "Nunu"),
  ]

  it("prioritizes prefix matches and ignores short substring noise", () => {
    expect(filterAndRankChampions(champions, "lu").map((c) => c.name)).toEqual([
      "Lucian",
      "Lulu",
      "Lux",
    ])
  })

  it("allows contains matches for more specific queries", () => {
    expect(filterAndRankChampions(champions, "til").map((c) => c.name)).toEqual([
      "Nautilus",
    ])
  })

  it("normalizes case and accents", () => {
    expect(filterAndRankChampions([champ("LeBlanc")], "le").map((c) => c.name))
      .toEqual(["LeBlanc"])
  })
})
