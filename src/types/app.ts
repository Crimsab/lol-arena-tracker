import type { BuildSource } from "../helpers/buildLinks"

export interface StoredSettings {
  isColoredWhenDone: boolean
  showChampionNames: boolean
  hideCompletedChampions: boolean
  hideMissingChampions: boolean
  viewMode: 'grid' | 'small-grid' | 'list'
  customLeaguePath: string
  favoriteBuildSource: BuildSource
}

export interface ExportData {
  challengeName: string
  challengeDescription: string
  totalChampions: number
  completedChampions: number
  completionPercentage: number
  champions: Array<{
    id: number
    name: string
    alias: string
    roles: string[]
    completed: boolean
  }>
  exportDate: string
}
