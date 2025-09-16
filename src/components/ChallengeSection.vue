<script setup lang="ts">
import { computed, ref } from "vue"
import {
  AramStats,
  Challenge,
  Champion,
  ChampionRole,
  ChampionRoles,
} from "../types/lol"
import AramStatBox from "./AramStatBox.vue"
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"
import {
  faUserNinja,
  faFistRaised,
  faHatWizard,
  faCrosshairs,
  faHandHoldingHeart,
  faShieldAlt,
  faCheck,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons"
import LeagueDropdown from "./LeagueDropdown.vue"

const Filters = ["All", "Not Done", "Done"] as const
type Filter = (typeof Filters)[number]

const typeIcons: Record<ChampionRole, IconDefinition> = {
  assassin: faUserNinja,
  fighter: faFistRaised,
  mage: faHatWizard,
  marksman: faCrosshairs,
  support: faHandHoldingHeart,
  tank: faShieldAlt,
}

const props = defineProps<{
  challenge: Challenge
  allChampions: Champion[]
  isColoredWhenDone: boolean
  showChampionNames: boolean
  hideCompletedChampions: boolean
  hideMissingChampions: boolean
  viewMode: 'grid' | 'small-grid' | 'list'
  favoriteBuildSource: 'opgg' | 'ugg' | 'metasrc' | 'lolalytics' | 'mobalytics'
  stats: AramStats | null
}>()

const championBuildLink = (champ: Champion) => {
  const alias = champ.alias.toLowerCase()
  
  if (props.challenge.mode === "Arena") {
    switch (props.favoriteBuildSource) {
      case "opgg":
        return `https://www.op.gg/modes/arena/${alias}/build?region=global`
      case "ugg":
        return `https://u.gg/lol/champions/arena/${alias}-arena-build`
      case "metasrc":
        return `https://www.metasrc.com/lol/arena/build/${alias}`
      case "lolalytics":
        return `https://lolalytics.com/lol/${alias}/arena/build/`
      case "mobalytics":
        return `https://mobalytics.gg/lol/champions/${alias}/arena-builds`
    }
  }
  
  // Fallback for other game modes
  switch (props.challenge.mode) {
    case "Aram":
      return `https://aram.zone/champion/${alias}`
    case "Rift":
      return `https://u.gg/lol/champions/${alias}/build`
    default:
      return `https://www.op.gg/modes/arena/${alias}/build?region=global`
  }
}

const showAramStats = ref(false)
const filter = ref<Filter>("All")
const selectedTypes = ref<Set<ChampionRole>>(new Set())
const search = ref<string>("")

const toggleType = (type: ChampionRole) => {
  if (selectedTypes.value.has(type)) {
    selectedTypes.value.delete(type)
  } else {
    selectedTypes.value.add(type)
  }
}

const capitalize = (v: string) => {
  return v.charAt(0).toUpperCase() + v.slice(1)
}

const championsList = computed(() => {
  let list = props.challenge.champions

  // Apply hide filters first
  if (props.hideCompletedChampions) {
    list = list.filter((c) => !c.done)
  }
  if (props.hideMissingChampions) {
    list = list.filter((c) => c.done)
  }

  // Apply existing filters
  switch (filter.value) {
    case "All":
      // Already filtered above
      break
    case "Done":
      list = list.filter((c) => c.done)
      break
    case "Not Done":
      list = list.filter((c) => !c.done)
      break
  }

  if (selectedTypes.value.size > 0) {
    // We don't filter on the secondary role, it doesn't narrow enough
    // e.g. Riven, Lucian would count as assassins
    list = list.filter((c) => selectedTypes.value.has(c.roles[0]))
  }

  if (search.value) {
    return list.filter((c) =>
      c.name.toLocaleLowerCase().includes(search.value.toLowerCase())
    )
  }

  return list
})

const filterOptions = computed(() => {
  return Filters.map((filter) => ({
    name: filter,
    value: filter,
  }))
})
</script>

<template>
  <div class="challenge">
    <div class="heading">
      <h1>
        {{ challenge.name }} ({{ challenge.totalDone }} /
        {{ 60 }})
      </h1>
      <div class="filters">
        <LeagueDropdown v-model="filter" :options="filterOptions" />
        <input
          class="league-input search"
          v-model="search"
          type="search"
          placeholder="Search"
        />
      </div>
    </div>
    <div class="description-container">
      <p>{{ challenge.description }}</p>

      <div v-if="challenge.mode === 'Aram'" class="stats-checkbox">
        <input type="checkbox" id="show-stats" v-model="showAramStats" />
        <label for="show-stats">Show ARAM balance changes</label>
      </div>
    </div>

    <div class="type-filters-container">
      <div class="type-filters">
        <button
          v-for="type in ChampionRoles"
          :key="type"
          class="league-button type-button"
          :class="{ active: selectedTypes.has(type) }"
          @click="toggleType(type)"
        >
          <FontAwesomeIcon :icon="typeIcons[type]" />
          <span>{{ capitalize(type) }}</span>
        </button>
      </div>
    </div>


    <div class="champions-container" :class="{ 
      'list-view': viewMode === 'list',
      'small-grid-view': viewMode === 'small-grid'
    }">
      <div v-for="champ in championsList" class="champion" :class="{ 
        'list-item': viewMode === 'list',
        'small-grid-item': viewMode === 'small-grid'
      }">
        <a :href="championBuildLink(champ)" target="_blank">
          <img
            :class="{ greyed: isColoredWhenDone ? champ.done : !champ.done }"
            :src="`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champ.id}.png`"
            :alt="champ.id.toString()"
          />
        </a>
        <div v-if="champ.done" class="check-mark">
          <FontAwesomeIcon :icon="faCheck" />
        </div>
        <AramStatBox
          v-if="
            challenge.mode === 'Aram' &&
            stats &&
            showAramStats &&
            stats[champ.alias]
          "
          :stats="stats[champ.alias]"
        />
        <p class="champion-name" 
           v-if="showChampionNames || viewMode === 'list'" 
           :class="{ 'show': showChampionNames && viewMode === 'small-grid' }">
          {{ champ.name }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.description-container {
  display: flex;
  justify-content: space-between;
}

.filters {
  display: flex;
  align-items: center;
}

.stats-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.stats-checkbox input {
  height: 16px;
  width: 16px;
  accent-color: #0ac8b9;
  margin-right: 8px;
  cursor: pointer;
}
.stats-checkbox label {
  cursor: pointer;
}

select,
input.search {
  margin-left: 32px;
}


.champions-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.champions-container.list-view {
  flex-direction: column;
  gap: 4px;
}

.champions-container.small-grid-view {
  gap: 1px;
}

.champion.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border: 1px solid #3c3c41;
}

.champion.list-item a {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.champion.list-item img {
  width: 48px;
  height: 48px;
}

.champion.list-item .champion-name {
  flex: 1;
  text-align: left;
  margin: 0;
  font-size: 16px;
  font-weight: bold;
}

.champion.small-grid-item {
  width: 80px;
  height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.champion.small-grid-item a {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}

.champion.small-grid-item img {
  width: 64px;
  height: 64px;
}

.champion.small-grid-item .champion-name {
  font-size: 10px;
  text-align: center;
  margin: 4px 0 0 0;
  line-height: 1.2;
  word-wrap: break-word;
  max-width: 80px;
  display: none; /* Hidden by default for small grid */
}

.champion.small-grid-item .champion-name.show {
  display: block; /* Show when showChampionNames is true */
}

h1 {
  font-family: "BeaufortforLol Bold";
  font-size: 2.5em;
  text-transform: uppercase;
  margin: 0;
}

p {
  margin: 0;
  margin-bottom: 8px;
}

.greyed {
  filter: brightness(30%);
}

.champion {
  position: relative;
}

.champion:hover {
  filter: brightness(150%);
}

.champion a {
  position: relative;
  display: block;
  width: 128px;
  height: 128px;
  border: 1px solid #3c3c41;
  text-decoration: none;
}

.champion-name {
  text-align: center;
  line-height: 1;
  padding: 4px;
  color: #a09b8c;
  white-space: nowrap;
}

img {
  height: 128px;
  width: 128px;
}

.check-mark {
  position: absolute;
  z-index: 1;
  top: -8px;
  right: -8px;
  background-color: #0ac8b9;
  border-radius: 50%;
  border: 2px solid black;
  padding: 2px 6px;
  font-size: 14px;
  color: black;
  font-weight: bold;
}

.type-filters-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  margin-bottom: 24px;
}

.type-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.type-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
}

.type-button.active {
  background: linear-gradient(to bottom, #433d2b, #1e2328);
  color: #0ac8b9;
}
</style>
