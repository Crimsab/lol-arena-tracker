<script setup lang="ts">
import { onMounted, ref, computed } from "vue"

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"
import { faGear } from "@fortawesome/free-solid-svg-icons"

import { LCUCredentials, RawChallenge } from "./types/lcu"
import { AramStats, Challenge, Champion, Summoner } from "./types/lol"
import { StoredSettings, ExportData } from "./types/app"
import {
  challengeFromCompletedIds as challengeFromRaw,
  makeLCURequest,
  parseMerakiFile,
} from "./helpers/utils"
import { challengeWithCompletion } from "./constants"
import ChallengeSection from "./components/ChallengeSection.vue"
import Settings from "./components/Settings.vue"

const credentials = ref<LCUCredentials | null>(null)

const allChampions = ref<Champion[] | null>(null)
const summoner = ref<Summoner | null>(null)
const challenges = ref<Challenge[]>([])
const stats = ref<AramStats | null>(null)

// Prevent multiple simultaneous fetches
let isFetching = false
let lastFetchTime = 0
const FETCH_DEBOUNCE_MS = 1000 // 1 second debounce

onMounted(async () => {
  window.ipcRenderer.send("app-ready")
  const storedAramStats = await window.ipcRenderer.invoke(
    "store-get",
    "aram-stats"
  )
  if (storedAramStats) {
    stats.value = JSON.parse(storedAramStats)
  } else {
    await fetchAramStats()
  }
})

const fetchAramStats = async () => {
  const res = await fetch(
    `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json`,
    { cache: "no-cache" }
  )
  const parsed = parseMerakiFile(await res.json())
  window.ipcRenderer.send("store-set", "aram-stats", JSON.stringify(parsed))
  stats.value = parsed
}

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
      credentials.value,
      "/lol-summoner/v1/current-summoner"
    )

    summoner.value = summonerRes
    console.log("fetchLCU: Got summoner:", summonerRes.summonerLevel)

    const champsRes = await makeLCURequest<Champion[]>(
      credentials.value,
      `/lol-champions/v1/inventories/${summonerRes.summonerId}/champions-minimal`
    )

    console.log("fetchLCU: Got", champsRes.length, "champions from API")

    // Debug: Log some champion names to see duplicates
    const championNames = champsRes.map(c => c.name).slice(0, 10)
    console.log("fetchLCU: Sample champion names:", championNames)

    // Remove the first champ ("None" champion)
    champsRes.shift()

    // Find and log duplicates before deduplication
    const nameCounts = champsRes.reduce((acc, champ) => {
      acc[champ.name] = (acc[champ.name] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const duplicates = Object.entries(nameCounts).filter(([name, count]) => count > 1)
    if (duplicates.length > 0) {
      console.log("fetchLCU: Found exact name duplicates:", duplicates)
    }

    // Find champions that start with the same name (like "Amumu" and "Amumu Bot dell'Apocalisse")
    const baseNameGroups = champsRes.reduce((acc, champ) => {
      // Extract base name (first word before any space or special characters)
      const baseName = champ.name.split(/[\s\-_]/)[0]
      if (!acc[baseName]) {
        acc[baseName] = []
      }
      acc[baseName].push(champ)
      return acc
    }, {} as Record<string, Champion[]>)

    const nameVariants = Object.entries(baseNameGroups).filter(([baseName, champs]) => champs.length > 1)
    if (nameVariants.length > 0) {
      console.log("fetchLCU: Found champions with same base name:", nameVariants.map(([base, champs]) => [base, champs.map(c => c.name)]))
    }

    // Deduplicate champions by base name (keep the shortest name for each base name)
    const uniqueChamps = champsRes.filter((champ, index, array) => {
      const baseName = champ.name.split(/[\s\-_]/)[0]
      const sameBaseChamps = array.filter(c => c.name.split(/[\s\-_]/)[0] === baseName)
      
      // If there are multiple champions with same base name, keep the one with shortest name
      if (sameBaseChamps.length > 1) {
        const shortestName = sameBaseChamps.reduce((shortest, current) => 
          current.name.length < shortest.name.length ? current : shortest
        )
        return champ.name === shortestName.name
      }
      
      // If only one champion with this base name, keep it
      return true
    })

    console.log("fetchLCU: After deduplication:", uniqueChamps.length, "unique champions")

    // Verify deduplication worked
    const finalBaseNames = uniqueChamps.map(champ => champ.name.split(/[\s\-_]/)[0])
    const finalBaseNameCounts = finalBaseNames.reduce((acc, baseName) => {
      acc[baseName] = (acc[baseName] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const remainingDuplicates = Object.entries(finalBaseNameCounts).filter(([baseName, count]) => count > 1)
    if (remainingDuplicates.length > 0) {
      console.error("fetchLCU: Still have base name duplicates after deduplication:", remainingDuplicates)
    } else {
      console.log("fetchLCU: ✅ Deduplication successful - no base name duplicates remaining")
    }

    // Log some examples of what was kept vs removed
    const keptChampions = uniqueChamps.map(c => c.name).slice(0, 10)
    console.log("fetchLCU: Sample kept champions:", keptChampions)

    const allChamps = uniqueChamps.sort((a, b) => a.name.localeCompare(b.name))
    allChampions.value = allChamps

    const allChallenges: Record<string, RawChallenge> = await makeLCURequest(
      credentials.value,
      "/lol-challenges/v1/challenges/local-player"
    )

    console.log("fetchLCU: Got challenges:", Object.keys(allChallenges).length)

    challenges.value = challengeWithCompletion.map((c) => {
      const challenge = challengeFromRaw(allChallenges[c.id], allChamps, c.gameMode)
      console.log(`fetchLCU: Processed challenge ${c.id}:`, challenge.totalDone, "done out of", allChamps.length)
      return challenge
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
const favoriteBuildSource = ref<'opgg' | 'ugg' | 'metasrc' | 'lolalytics' | 'mobalytics'>('opgg')

const updateSettings = (settings: StoredSettings) => {
  isColoredWhenDone.value = settings.isColoredWhenDone
  showChampionNames.value = settings.showChampionNames
  hideCompletedChampions.value = settings.hideCompletedChampions
  hideMissingChampions.value = settings.hideMissingChampions
  viewMode.value = settings.viewMode
  customLeaguePath.value = settings.customLeaguePath
  favoriteBuildSource.value = settings.favoriteBuildSource
  window.ipcRenderer.send("store-set", "settings", JSON.stringify(settings))
}


window.ipcRenderer.on("end-of-game", () => {
  console.log("Event: end-of-game - refetching data")
  fetchLCU()
})


window.ipcRenderer.on(
  "credentials",
  async (_event, newCredentials: LCUCredentials) => {
    console.log("Event: credentials - received", newCredentials ? "valid credentials" : "null credentials")
    credentials.value = newCredentials
    await fetchLCU()
    const storedSelectedChallengeIdx = await window.ipcRenderer.invoke(
      "store-get",
      "selected-challenge-index"
    )

    const storedSettings = await window.ipcRenderer.invoke(
      "store-get",
      "settings"
    )

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


window.ipcRenderer.on("refetch", () => {
  console.log("Event: refetch - triggered")
  fetchLCU()
})

window.ipcRenderer.on("custom-path-test-result", (_, result: { success: boolean; message: string }) => {
  console.log("Custom path test result:", result)
  // You could show a toast notification here if desired
})

window.ipcRenderer.on("export-result", (_, result: { success: boolean; message: string }) => {
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
  window.ipcRenderer.send("test-custom-league-path", path)
}

const exportData = (format: 'txt' | 'json' | 'csv' | 'excel') => {
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
    window.ipcRenderer.send("export-data", { format, data: cleanExportData })
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
        :all-champions="allChampions"
        :isColoredWhenDone="isColoredWhenDone"
        :showChampionNames="showChampionNames"
        :hideCompletedChampions="hideCompletedChampions"
        :hideMissingChampions="hideMissingChampions"
        :viewMode="viewMode"
        :favoriteBuildSource="favoriteBuildSource"
        :stats="stats"
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
