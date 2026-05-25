import { describe, expect, it } from "vitest"
import { championBuildLink, metasrcChampionSlug } from "./buildLinks"

const lux = { alias: "Lux", name: "Lux" }

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

  it.each([
    [{ alias: "MissFortune", name: "Miss Fortune" }, "miss-fortune"],
    [{ alias: "AurelionSol", name: "Aurelion Sol" }, "aurelion-sol"],
    [{ alias: "Belveth", name: "Bel'Veth" }, "belveth"],
    [{ alias: "Chogath", name: "Cho'Gath" }, "chogath"],
    [{ alias: "DrMundo", name: "Dr. Mundo" }, "dr-mundo"],
    [{ alias: "JarvanIV", name: "Jarvan IV" }, "jarvan-iv"],
    [{ alias: "Kaisa", name: "Kai'Sa" }, "kaisa"],
    [{ alias: "Khazix", name: "Kha'Zix" }, "khazix"],
    [{ alias: "KogMaw", name: "Kog'Maw" }, "kogmaw"],
    [{ alias: "KSante", name: "K'Sante" }, "ksante"],
    [{ alias: "Leblanc", name: "LeBlanc" }, "leblanc"],
    [{ alias: "LeeSin", name: "Lee Sin" }, "lee-sin"],
    [{ alias: "MasterYi", name: "Master Yi" }, "master-yi"],
    [{ alias: "MonkeyKing", name: "Wukong" }, "wukong"],
    [{ alias: "Nunu", name: "Nunu & Willump" }, "nunu"],
    [{ alias: "RekSai", name: "Rek'Sai" }, "reksai"],
    [{ alias: "Renata", name: "Renata Glasc" }, "renata-glasc"],
    [{ alias: "TahmKench", name: "Tahm Kench" }, "tahm-kench"],
    [{ alias: "TwistedFate", name: "Twisted Fate" }, "twisted-fate"],
    [{ alias: "Velkoz", name: "Vel'Koz" }, "velkoz"],
    [{ alias: "XinZhao", name: "Xin Zhao" }, "xin-zhao"],
  ])("builds MetaSRC slug %s as %s", (champion, slug) => {
    expect(metasrcChampionSlug(champion)).toBe(slug)
    expect(championBuildLink(champion, "metasrc")).toBe(
      `https://www.metasrc.com/lol/arena/build/${slug}`
    )
  })
})
