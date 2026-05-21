<script setup lang="ts">
import { onMounted, ref } from "vue"

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"
import { faGear } from "@fortawesome/free-solid-svg-icons"

import { LCUCredentials, RawChallenge } from "./types/lcu"
import { Challenge, Champion, Summoner } from "./types/lol"
import { StoredSettings, ExportData } from "./types/app"
import {
  challengeFromCompletedIds as challengeFromRaw,
  makeLCURequest,
} from "./helpers/utils"
import type { BuildSource } from "./helpers/buildLinks"
import { normalizeChampionList } from "./helpers/champions"
import { arenaChallengeIds } from "./constants"
import ChallengeSection from "./components/ChallengeSection.vue"
import Settings from "./components/Settings.vue"

const credentials = ref<LCUCredentials | null>(null)

const allChampions = ref<Champion[] | null>(null)
const summoner = ref<Summoner | null>(null)
const challenges = ref<Challenge[]>([])

// Prevent multiple simultaneous fetches
let isFetching = false
let lastFetchTime = 0
const FETCH_DEBOUNCE_MS = 1000 // 1 second debounce

onMounted(() => {
  window.arenaAPI.appReady()
})

const fetchLCU = async () => {
  if (credentials.value === null) return

  const now = Date.now()

  // Prevent multiple simultaneous fetches
  if (isFetching) {
    console.log("fetchLCU: Already fetching, skipping...")
    return
  }

  // Debounce rapid calls
  if (now - lastFetchTime < FETCH_DEBOUNCE_MS) {
    console.log("fetchLCU: Debounced - too soon since last fetch")
    return
  }

  isFetching = true
  lastFetchTime = now
  console.log("fetchLCU: Starting fetch...")

  try {
    const summonerRes = await makeLCURequest<Summoner>(
      "/lol-summoner/v1/current-summoner"
    )

    summoner.value = summonerRes
    console.log("fetchLCU: Got summoner:", summonerRes.summonerLevel)

    const champsRes = await makeLCURequest<Champion[]>(
      `/lol-champions/v1/inventories/${summonerRes.summonerId}/champions-minimal`
    )

    console.log("fetchLCU: Got", champsRes.length, "champions from API")

    const allChamps = normalizeChampionList(champsRes)
    console.log("fetchLCU: Normalized to", allChamps.length, "champions")
    allChampions.value = allChamps

    const allChallenges: Record<string, RawChallenge> = await makeLCURequest(
      "/lol-challenges/v1/challenges/local-player"
    )

    console.log("fetchLCU: Got challenges:", Object.keys(allChallenges).length)

    challenges.value = arenaChallengeIds.flatMap((c) => {
      const rawChallenge = allChallenges[c.id]
      if (!rawChallenge) {
        console.error(`fetchLCU: Challenge ${c.id} was not returned by LCU`)
        return []
      }

      const challenge = challengeFromRaw(rawChallenge, allChamps)
      console.log(`fetchLCU: Processed challenge ${c.id}:`, challenge.totalDone, "done out of", allChamps.length)
      return [challenge]
    })

    console.log("fetchLCU: Fetch completed successfully")
  } catch (e) {
    console.error("fetchLCU: Error during fetch:", e)
  } finally {
    isFetching = false
  }
}

// Only tracking Arena God challenge, so no need for selection
const isColoredWhenDone = ref(false)
const showChampionNames = ref(false)
const hideCompletedChampions = ref(false)
const hideMissingChampions = ref(false)
const viewMode = ref<'grid' | 'small-grid' | 'list'>('grid')
const customLeaguePath = ref('')
const favoriteBuildSource = ref<BuildSource>('opgg')

const updateSettings = (settings: StoredSettings) => {
  isColoredWhenDone.value = settings.isColoredWhenDone
  showChampionNames.value = settings.showChampionNames
  hideCompletedChampions.value = settings.hideCompletedChampions
  hideMissingChampions.value = settings.hideMissingChampions
  viewMode.value = settings.viewMode
  customLeaguePath.value = settings.customLeaguePath
  favoriteBuildSource.value = settings.favoriteBuildSource
  window.arenaAPI.setStore("settings", JSON.stringify(settings))
}


window.arenaAPI.onEndOfGame(() => {
  console.log("Event: end-of-game - refetching data")
  fetchLCU()
})


window.arenaAPI.onCredentials(
  async (newCredentials: LCUCredentials | null) => {
    console.log("Event: credentials - received", newCredentials ? "valid credentials" : "null credentials")
    credentials.value = newCredentials
    await fetchLCU()
    const storedSettings = await window.arenaAPI.getStore("settings")

    if (storedSettings) {
      const settings: StoredSettings = JSON.parse(storedSettings)
      isColoredWhenDone.value = settings.isColoredWhenDone
      showChampionNames.value = settings.showChampionNames
      hideCompletedChampions.value = settings.hideCompletedChampions || false
      hideMissingChampions.value = settings.hideMissingChampions || false
      viewMode.value = settings.viewMode || 'grid'
      customLeaguePath.value = settings.customLeaguePath || ''
      favoriteBuildSource.value = settings.favoriteBuildSource || 'opgg'
    }

    // No longer needed since we only have one challenge
  }
)


window.arenaAPI.onRefetch(() => {
  console.log("Event: refetch - triggered")
  fetchLCU()
})

window.arenaAPI.onCustomPathTestResult((result: { success: boolean; message: string }) => {
  console.log("Custom path test result:", result)
  // You could show a toast notification here if desired
})

window.arenaAPI.onExportResult((result: { success: boolean; message: string }) => {
  console.log("Export result:", result)
  if (result.success) {
    alert(`✅ Export successful!\n\n${result.message}`)
  } else {
    alert(`❌ Export failed!\n\n${result.message}`)
  }
})

const settingsVisible = ref(false)

const onClickSettings = () => {
  settingsVisible.value = !settingsVisible.value
}

const testCustomLeaguePath = (path: string) => {
  console.log("Testing custom League path:", path)
  // Send custom path to main process for testing
  window.arenaAPI.testCustomLeaguePath(path)
}

const exportData = (format: 'txt' | 'json' | 'csv') => {
  if (!challenges.value[0] || !allChampions.value) {
    console.log("No data to export")
    return
  }

  const challenge = challenges.value[0]
  
  // Create a clean, serializable object without circular references
  const cleanExportData: ExportData = {
    challengeName: String(challenge.name || 'Arena God'),
    challengeDescription: String(challenge.description || 'Complete the Arena God challenge'),
    totalChampions: Number(challenge.champions?.length || 0),
    completedChampions: Number(challenge.totalDone || 0),
    completionPercentage: Math.round(((challenge.totalDone || 0) / (challenge.champions?.length || 1)) * 100),
    champions: (challenge.champions || []).map(champ => ({
      id: Number(champ.id || 0),
      name: String(champ.name || ''),
      alias: String(champ.alias || ''),
      roles: Array.isArray(champ.roles) ? champ.roles.map(r => String(r)) : [],
      completed: Boolean(champ.done || false)
    })),
    exportDate: new Date().toISOString()
  }

  console.log("Exporting data in", format, "format")
  console.log("Clean export data:", cleanExportData)
  
  try {
    window.arenaAPI.exportData({ format, data: cleanExportData })
  } catch (error) {
    console.error("Failed to send export data:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    alert(`❌ Export failed!\n\nError: ${errorMessage}`)
  }
}

// No longer needed since we only have one challenge
</script>

<template>
  <div class="app">
    <div class="app-heading">
      <h1>ARENA TRACKER</h1>
    </div>
    <button class="league-button settings-button" @click="onClickSettings">
      <FontAwesomeIcon :icon="faGear" />
    </button>
    <div class="challenges" v-if="credentials && allChampions">
      <ChallengeSection
        v-if="challenges[0]"
        :challenge="challenges[0]"
        :isColoredWhenDone="isColoredWhenDone"
        :showChampionNames="showChampionNames"
        :hideCompletedChampions="hideCompletedChampions"
        :hideMissingChampions="hideMissingChampions"
        :viewMode="viewMode"
        :favoriteBuildSource="favoriteBuildSource"
      />
    </div>
    <div v-else>Waiting for a League client...</div>
    <Settings
      v-model:visible="settingsVisible"
      :isColoredWhenDone="isColoredWhenDone"
      :showChampionNames="showChampionNames"
      :hideCompletedChampions="hideCompletedChampions"
      :hideMissingChampions="hideMissingChampions"
      :viewMode="viewMode"
      :customLeaguePath="customLeaguePath"
      :favoriteBuildSource="favoriteBuildSource"
      @update:isColoredWhenDone="
        (v) => updateSettings({ isColoredWhenDone: v, showChampionNames, hideCompletedChampions, hideMissingChampions, viewMode, customLeaguePath, favoriteBuildSource })
      "
      @update:showChampionNames="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames: v, hideCompletedChampions, hideMissingChampions, viewMode, customLeaguePath, favoriteBuildSource })
      "
      @update:hideCompletedChampions="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames, hideCompletedChampions: v, hideMissingChampions, viewMode, customLeaguePath, favoriteBuildSource })
      "
      @update:hideMissingChampions="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames, hideCompletedChampions, hideMissingChampions: v, viewMode, customLeaguePath, favoriteBuildSource })
      "
      @update:viewMode="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames, hideCompletedChampions, hideMissingChampions, viewMode: v, customLeaguePath, favoriteBuildSource })
      "
      @update:customLeaguePath="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames, hideCompletedChampions, hideMissingChampions, viewMode, customLeaguePath: v, favoriteBuildSource })
      "
      @update:favoriteBuildSource="
        (v) => updateSettings({ isColoredWhenDone, showChampionNames, hideCompletedChampions, hideMissingChampions, viewMode, customLeaguePath, favoriteBuildSource: v })
      "
      @test-league-path="testCustomLeaguePath"
      @refresh-data="fetchLCU"
      @export-data="exportData"
    />
  </div>
</template>

<style>
.app {
  background: var(--main-bg-gradient);
  border-top: solid 2px #785a28;
  position: relative;
  padding: 16px;
  color: var(--main-text-color);
}

.app-heading {
  text-align: center;
  margin-bottom: 16px;
  position: relative;
}

.app-heading h1 {
  color: #c8aa6e;
  font-family: "BeaufortforLOL Bold";
  font-size: 36px;
  font-weight: bold;
  margin: 0;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.tab {
  cursor: pointer;
  padding: 8px;
  border: solid 2px transparent;
}

.tab:hover {
  border-bottom: solid 2px #785a28;
  border-right: solid 2px #785a28;
}

.tab.selected {
  border-bottom: solid 2px #785a28;
  border-right: solid 2px #785a28;
}

.challenges > * {
  margin-bottom: 32px;
}

button.settings-button {
  position: absolute;
  right: 16px;
  top: 18px;
  font-size: 16px;
  height: 40px;
  width: 40px;
  padding: 10px;
  border-radius: 50%;
}
</style>
