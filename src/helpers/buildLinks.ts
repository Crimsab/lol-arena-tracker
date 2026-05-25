import type { Champion } from "../types/lol"

export const buildSources = [
  "opgg",
  "ugg",
  "metasrc",
  "lolalytics",
  "mobalytics",
] as const

export type BuildSource = (typeof buildSources)[number]

function simpleChampionSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function metasrcChampionSlug(champion: Pick<Champion, "alias" | "name">) {
  if (champion.name.includes("&")) {
    return simpleChampionSlug(champion.alias)
  }

  return champion.name
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function championBuildLink(
  champion: Pick<Champion, "alias" | "name">,
  buildSource: BuildSource
) {
  const alias = champion.alias.toLowerCase()

  switch (buildSource) {
    case "opgg":
      return `https://op.gg/lol/modes/arena/${alias}/build`
    case "ugg":
      return `https://u.gg/lol/champions/arena/${alias}-arena-build`
    case "metasrc":
      return `https://www.metasrc.com/lol/arena/build/${metasrcChampionSlug(champion)}`
    case "lolalytics":
      return `https://lolalytics.com/lol/${alias}/arena/build/`
    case "mobalytics":
      return `https://mobalytics.gg/lol/champions/${alias}/arena-builds`
  }
}
