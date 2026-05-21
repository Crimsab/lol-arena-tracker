export interface Summoner {
  accountId: string
  gameName: string
  profileIconId: number
  puuid: string
  summonerId: number
  summonerLevel: number
  tagLine: string
}

export interface Champion {
  id: number
  alias: string
  name: string
  roles: ChampionRole[]
}

export const ChampionRoles = [
  "assassin",
  "fighter",
  "mage",
  "marksman",
  "support",
  "tank",
] as const
export type ChampionRole = (typeof ChampionRoles)[number]

export interface Challenge {
  name: string
  description: string
  champions: Array<Champion & { done: boolean }>
  totalDone: number
}
