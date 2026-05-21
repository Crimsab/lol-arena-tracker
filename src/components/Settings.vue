<script setup lang="ts">
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"
import { faClose } from "@fortawesome/free-solid-svg-icons"
import { faGithub } from "@fortawesome/free-brands-svg-icons"
import type { BuildSource } from "../helpers/buildLinks"

const emit = defineEmits(['test-league-path', 'refresh-data', 'export-data'])

const testLeaguePath = () => {
  emit('test-league-path', customLeaguePath.value)
}

const refreshData = () => {
  emit('refresh-data')
}

const exportData = (format: 'txt' | 'json' | 'csv') => {
  emit('export-data', format)
}

const visible = defineModel<boolean>("visible", { required: true })
const isColoredWhenDone = defineModel<boolean>("isColoredWhenDone", {
  required: true,
})
const showChampionNames = defineModel<boolean>("showChampionNames", {
  required: true,
})
const hideCompletedChampions = defineModel<boolean>("hideCompletedChampions", {
  required: true,
})
const hideMissingChampions = defineModel<boolean>("hideMissingChampions", {
  required: true,
})
const viewMode = defineModel<'grid' | 'small-grid' | 'list'>("viewMode", {
  required: true,
})
const customLeaguePath = defineModel<string>("customLeaguePath", {
  required: true,
})
const favoriteBuildSource = defineModel<BuildSource>("favoriteBuildSource", {
  required: true,
})
</script>

<template>
  <div class="settings" :class="{ hidden: !visible }">
    <div class="heading-container">
      <p class="heading">Settings</p>
      <FontAwesomeIcon
        class="close-button"
        @click="visible = false"
        :icon="faClose"
      />
    </div>
    <div class="container">
      <div class="setting-group">
        <label class="setting-label">View Mode</label>
        <div class="view-mode-buttons">
          <button
            class="league-button view-mode"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            Grid
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: viewMode === 'small-grid' }"
            @click="viewMode = 'small-grid'"
          >
            Small Grid
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            List
          </button>
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Champion Display</label>
        <button
          class="league-button view-mode"
          @click="isColoredWhenDone = !isColoredWhenDone"
        >
          {{ isColoredWhenDone ? "Completed champions are colored" : "Completed champions are greyed out" }}
        </button>

        <button
          class="league-button view-mode"
          @click="showChampionNames = !showChampionNames"
        >
          {{ showChampionNames ? "Hide" : "Show" }} champion names
        </button>

        <button
          class="league-button view-mode"
          @click="hideCompletedChampions = !hideCompletedChampions"
        >
          {{ hideCompletedChampions ? "Show" : "Hide" }} completed champions
        </button>

        <button
          class="league-button view-mode"
          @click="hideMissingChampions = !hideMissingChampions"
        >
          {{ hideMissingChampions ? "Show" : "Hide" }} missing champions
        </button>
      </div>

      <div class="setting-group">
        <label class="setting-label">League Client Path</label>
        <div class="path-input-group">
          <input
            v-model="customLeaguePath"
            class="league-input path-input"
            type="text"
            placeholder="C:\Games\Riot Games\League of Legends"
          />
          <button
            class="league-button path-button"
            @click="testLeaguePath"
          >
            Test
          </button>
        </div>
        <p class="path-help">Leave empty for auto-detection</p>
      </div>

      <div class="setting-group">
        <label class="setting-label">Build Source</label>
        <div class="build-source-buttons">
          <button
            class="league-button view-mode"
            :class="{ active: favoriteBuildSource === 'opgg' }"
            @click="favoriteBuildSource = 'opgg'"
          >
            OP.GG
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: favoriteBuildSource === 'ugg' }"
            @click="favoriteBuildSource = 'ugg'"
          >
            U.GG
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: favoriteBuildSource === 'metasrc' }"
            @click="favoriteBuildSource = 'metasrc'"
          >
            MetaSrc
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: favoriteBuildSource === 'lolalytics' }"
            @click="favoriteBuildSource = 'lolalytics'"
          >
            LoLalytics
          </button>
          <button
            class="league-button view-mode"
            :class="{ active: favoriteBuildSource === 'mobalytics' }"
            @click="favoriteBuildSource = 'mobalytics'"
          >
            Mobalytics
          </button>
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Data Management</label>
        <button class="league-button refresh" @click="refreshData">
          Refresh Data
        </button>
      </div>

      <div class="setting-group">
        <label class="setting-label">Export Data</label>
        <div class="export-buttons">
          <button class="league-button view-mode" @click="exportData('txt')">
            Export TXT
          </button>
          <button class="league-button view-mode" @click="exportData('json')">
            Export JSON
          </button>
          <button class="league-button view-mode" @click="exportData('csv')">
            Export CSV
          </button>
        </div>
      </div>
    </div>

    <div class="footer">
      <a
        class="about"
        href="https://github.com/Nyquase/lol-challenge-tracker"
        target="_blank"
      >
        <FontAwesomeIcon class="about-icon" :icon="faGithub" />Original source
      </a>
      <a
        class="about"
        href="https://github.com/Crimsab/lol-arena-tracker"
        target="_blank"
      >
        <FontAwesomeIcon class="about-icon" :icon="faGithub" />Project source
      </a>
    </div>
  </div>
</template>

<style scoped>
.settings {
  position: absolute;
  right: 16px;
  top: 68px;
  background-color: grey;
  z-index: 10;
  font-size: 16px;
  background-color: #161616;
  color: #cdbe91;
  box-shadow: inset 0 0 2px #000000, 4px 4px 8px #000;
  border: solid 2px #785a28;
  cursor: initial;
}

.heading-container {
  display: flex;
  justify-content: space-between;
  border-bottom: solid 1px #785a28;

  padding: 12px;
}

.heading {
  font-family: "BeaufortforLOL Bold";
  text-transform: uppercase;
  font-size: 20px;
  margin: 0;
  line-height: 1;
}

.close-button {
  cursor: pointer;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-weight: bold;
  color: #c8aa6e;
  font-size: 14px;
  text-transform: uppercase;
}

.view-mode-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.build-source-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.export-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.path-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-input {
  flex: 1;
  padding: 8px;
  background-color: #1e2328;
  border: 1px solid #3c3c41;
  color: #cdbe91;
  font-size: 14px;
}

.path-input::placeholder {
  color: #6b6b6b;
}

.path-button {
  padding: 8px 12px;
  white-space: nowrap;
}

.path-help {
  font-size: 12px;
  color: #6b6b6b;
  margin: 0;
  font-style: italic;
}

.settings.hidden {
  display: none;
}

button {
  padding: 8px;
}

.view-mode.active {
  background: linear-gradient(to bottom, #433d2b, #1e2328);
  color: #0ac8b9;
}

.footer {
  display: flex;
  gap: 8px;
  margin: 12px;
  margin-top: 0;
  justify-content: center;
}

.about {
  color: #0397ab;
}
.about-icon {
  font-size: 22px;
  margin-right: 4px;
}
</style>
