import { describe, expect, it } from "vitest"
import { championBuildLink } from "./buildLinks"

const lux = { alias: "Lux" }

describe("championBuildLink", () => {
  it("uses the current OP.GG Arena URL", () => {
    expect(championBuildLink(lux, "opgg")).toBe(
      "https://op.gg/lol/modes/arena/lux/build"
    )
  })

  it("builds Arena links for every configured source", () => {
    expect(championBuildLink(lux, "ugg")).toBe(
      "https://u.gg/lol/champions/arena/lux-arena-build"
    )
    expect(championBuildLink(lux, "metasrc")).toBe(
      "https://www.metasrc.com/lol/arena/build/lux"
    )
    expect(championBuildLink(lux, "lolalytics")).toBe(
      "https://lolalytics.com/lol/lux/arena/build/"
    )
    expect(championBuildLink(lux, "mobalytics")).toBe(
      "https://mobalytics.gg/lol/champions/lux/arena-builds"
    )
  })
})
