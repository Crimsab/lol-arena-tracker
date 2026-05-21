import { app, BrowserWindow, shell, ipcMain, dialog } from "electron"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"
import { WebSocket } from "ws"
import Store from "electron-store"
import electronUpdater from "electron-updater"
import {
  ChampSelectSessionEvent,
  LCUEventMessage,
  LCUEvents,
} from "./interface.js"

interface LCUCredentials {
  address: string
  port: number
  username: string
  password: string
  protocol: string
}

const allowedExternalHosts = new Set([
  "op.gg",
  "www.op.gg",
  "u.gg",
  "www.u.gg",
  "www.metasrc.com",
  "lolalytics.com",
  "mobalytics.gg",
  "github.com",
])

const storeKeys = new Set(["settings", "custom-league-path"])
const exportFormats = new Set(["txt", "json", "csv"])
const lcuPathPattern = /^\/lol-[a-z0-9-]+\/v\d+\//
const { autoUpdater } = electronUpdater

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, "../..")

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron")
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist")
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith("6.1")) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const preload = path.join(__dirname, "../preload/index.mjs")
const indexHtml = path.join(RENDERER_DIST, "index.html")

async function createWindow() {
  const win = new BrowserWindow({
    title: "Main window",
    icon: path.join(process.env.VITE_PUBLIC, "favicon.ico"),
    autoHideMenuBar: true,
    height: 920,
    width: VITE_DEV_SERVER_URL ? 1440 + 760 : 1440,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrl(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      openAllowedExternalUrl(url)
    }
  })

  return win
}

function openAllowedExternalUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:" && allowedExternalHosts.has(parsed.hostname)) {
      shell.openExternal(parsed.toString())
    }
  } catch (error) {
    console.warn("Blocked invalid external URL:", url, error)
  }
}

function sendCredentials(win: BrowserWindow, credentials: LCUCredentials | null) {
  console.log(`Main: sendCredentials called with credentials:`, credentials ? {
    address: credentials.address,
    port: credentials.port,
    protocol: credentials.protocol
  } : null)

  // Only send if credentials have actually changed
  const credentialsChanged = JSON.stringify(credentials) !== JSON.stringify(lastCredentials)
  if (!credentialsChanged) {
    console.log("Main: Credentials haven't changed, skipping send")
    return
  }

  lastCredentials = credentials

  if (credentials) {
    isConnected = true
    stopConnectionMonitoring()
  } else {
    isConnected = false
    // Restart monitoring when disconnected
    setTimeout(() => startConnectionMonitoring(win), 1000)
  }

  win.webContents.send("credentials", credentials ? {
    address: credentials.address,
    port: credentials.port,
    protocol: credentials.protocol,
    username: credentials.username,
  } : null)
}

function parseLockfile(lockfilePath: string): LCUCredentials | null {
  try {
    if (!fs.existsSync(lockfilePath)) {
      console.log(`Lockfile not found at: ${lockfilePath}`)
      return null
    }

    const content = fs.readFileSync(lockfilePath, 'utf8').trim()
    console.log(`Found League lockfile at: ${lockfilePath}`)

    const parts = content.split(':')
    if (parts.length !== 5) {
      console.error(`Invalid lockfile format. Expected 5 parts, got ${parts.length}`)
      return null
    }

    const [processName, _pid, port, password, protocol] = parts

    if (processName !== 'LeagueClient') {
      console.error(`Invalid process name in lockfile: ${processName}`)
      return null
    }

    const parsedPort = parseInt(port, 10)
    if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
      console.error(`Invalid LCU port in lockfile: ${port}`)
      return null
    }

    if (protocol !== "http" && protocol !== "https") {
      console.error(`Invalid LCU protocol in lockfile: ${protocol}`)
      return null
    }

    const credentials: LCUCredentials = {
      address: '127.0.0.1',
      port: parsedPort,
      username: 'riot',
      password: password,
      protocol
    }

    console.log(`Parsed credentials from lockfile:`, {
      address: credentials.address,
      port: credentials.port,
      protocol: credentials.protocol
    })

    return credentials
  } catch (error) {
    console.error(`Error parsing lockfile:`, error)
    return null
  }
}

async function tryManualLCUConnection(win: BrowserWindow): Promise<boolean> {
  // Don't try to connect if already connected
  if (isConnected) {
    console.log("Already connected, skipping manual connection attempt")
    return true
  }

  console.log("Trying manual LCU connection...")

  // Try common League installation paths
  const possiblePaths = [
    'C:\\Games\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
    'E:\\Riot Games\\League of Legends\\lockfile'
  ]

  // Add custom path if provided
  const customPath = await store.get('custom-league-path')
  if (typeof customPath === "string" && customPath.trim()) {
    possiblePaths.unshift(lockfilePathFromLeaguePath(customPath))
  }

  for (const lockfilePath of possiblePaths) {
    const credentials = parseLockfile(lockfilePath)
    if (credentials) {
      console.log(`Successfully connected using manual method with lockfile: ${lockfilePath}`)
      sendCredentials(win, credentials)
      // LCU refuses websocket connections too early, so delay it
      setTimeout(() => connectWebsocket(win, credentials), 10000)
      return true
    }
  }

  console.log("Manual LCU connection failed - no valid lockfile found")
  return false
}

function parseSessionEvent(event: ChampSelectSessionEvent) {
  return event.actions
    .flat()
    .find(
      (a) =>
        a.isAllyAction === true &&
        a.type === "pick" &&
        a.actorCellId === event.localPlayerCellId
    )?.championId
}

function parseEventMessage(message: string) {
  const [_, type, payload] = JSON.parse(message) as [number, LCUEvents, any]
  return { type, data: payload.data }
}

async function connectWebsocket(
  win: BrowserWindow,
  credentials: LCUCredentials
) {
  const { address, port, username, password } = credentials
  const url = `wss://${address}:${port}/`

  const ws = new WebSocket(url, "wamp", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
        "base64"
      )}`,
    },
    rejectUnauthorized: false,
  })

  ws.on("message", (e) => {
    let event: LCUEventMessage
    try {
      event = parseEventMessage(e.toString())
    } catch (error) {
      console.warn("Could not parse LCU websocket message:", error)
      return
    }

    switch (event.type) {
      case LCUEvents.EndOfGameStats:
        win.webContents.send("end-of-game")
        break
      case LCUEvents.ChampSelectSession:
        const champId = parseSessionEvent(event.data)
        if (champId < 0) {
          win.webContents.send("pick", null)
        }
        if (champId) {
          win.webContents.send("pick", champId)
        }
        break
      case LCUEvents.GameSession:
        if (event.data.phase === "InProgress") {
          win.webContents.send(
            "game-start",
            event.data.gameData.playerChampionSelections
          )
        }
        break
    }
  })

  // https://github.com/dysolix/hasagi-types/blob/main/dist/lcu-events.d.ts
  ws.on("open", () => {
    console.log("WebSocket connection established")
    // 5 Means Subscribe
    ws.send(`[5, "${LCUEvents.EndOfGameStats}"]`)
    ws.send(`[5, "${LCUEvents.ChampSelectSession}"]`)
    ws.send(`[5, "${LCUEvents.GameSession}"]`)
  })

  ws.on("close", () => {
    console.log("WebSocket connection closed")
    sendCredentials(win, null)
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
    sendCredentials(win, null)
  })
}

function connectToLcu(win: BrowserWindow) {
  console.log("Starting LCU connection attempt...")

  // First try manual connection method
  tryManualLCUConnection(win).then((success) => {
    if (success) {
      console.log("Manual LCU connection successful!")
      return
    }

    console.log("League client lockfile was not found. Waiting for manual path or next monitor tick.")
  })
}

// Configure store for portable mode
const store = new Store({
  cwd: process.env.PORTABLE_EXECUTABLE_DIR || undefined, // Use portable directory if available
  name: 'arena-tracker-config'
})

// Track connection status
let isConnected = false
let connectionCheckInterval: NodeJS.Timeout | null = null
let lastCredentials: LCUCredentials | null = null

function lockfilePathFromLeaguePath(leaguePath: string) {
  const trimmed = leaguePath.trim()
  if (!trimmed) return ""
  return trimmed.toLowerCase().endsWith("lockfile")
    ? trimmed
    : path.win32.join(trimmed, "lockfile")
}

// Export functions
function generateTxtExport(data: any): string {
  let content = `ARENA TRACKER EXPORT\n`
  content += `===================\n\n`
  content += `Challenge: ${data.challengeName}\n`
  content += `Description: ${data.challengeDescription}\n`
  content += `Progress: ${data.completedChampions}/${data.totalChampions} (${data.completionPercentage}%)\n`
  content += `Export Date: ${new Date(data.exportDate).toLocaleString()}\n\n`
  
  content += `COMPLETED CHAMPIONS:\n`
  content += `===================\n`
  data.champions.filter((champ: any) => champ.completed).forEach((champ: any) => {
    content += `✓ ${champ.name} (${champ.alias}) - ${champ.roles.join(', ')}\n`
  })
  
  content += `\nMISSING CHAMPIONS:\n`
  content += `=================\n`
  data.champions.filter((champ: any) => !champ.completed).forEach((champ: any) => {
    content += `✗ ${champ.name} (${champ.alias}) - ${champ.roles.join(', ')}\n`
  })
  
  return content
}

function generateCsvExport(data: any): string {
  let content = `Champion ID,Name,Alias,Roles,Completed\n`
  data.champions.forEach((champ: any) => {
    const roles = champ.roles.join(';')
    const completed = champ.completed ? 'Yes' : 'No'
    content += [
      champ.id,
      champ.name,
      champ.alias,
      roles,
      completed,
    ].map(csvCell).join(",") + "\n"
  })
  return content
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

async function makeLCURequest(path: string) {
  if (!lastCredentials) {
    throw new Error("League client is not connected")
  }

  if (!lcuPathPattern.test(path)) {
    throw new Error(`LCU path is not allowed: ${path}`)
  }

  const { address, port, username, password, protocol } = lastCredentials
  const url = new URL(`${protocol}://${address}:${port}${path}`)
  const headers = {
    accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
      "base64"
    )}`,
  }

  return new Promise((resolve, reject) => {
    const request = (protocol === "https" ? https : http).request(
      url,
      {
        headers,
        rejectUnauthorized: false,
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          body += chunk
        })
        response.on("end", () => {
          if (!response.statusCode || response.statusCode >= 400) {
            reject(new Error(`LCU request failed with ${response.statusCode}: ${path}`))
            return
          }

          try {
            resolve(JSON.parse(body))
          } catch (error) {
            reject(error)
          }
        })
      }
    )

    request.on("error", reject)
    request.end()
  })
}

function startConnectionMonitoring(win: BrowserWindow) {
  if (connectionCheckInterval) {
    return
  }

  // Check for connection every 5 seconds
  connectionCheckInterval = setInterval(async () => {
    if (!isConnected) {
      console.log("Checking for League client connection...")
      const success = await tryManualLCUConnection(win)
      if (success) {
        isConnected = true
        stopConnectionMonitoring()
      }
    }
  }, 5000)
}

function stopConnectionMonitoring() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval)
    connectionCheckInterval = null
  }
}

function setupAutoUpdater(win: BrowserWindow) {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on("update-available", async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Arena Tracker ${info.version} is available`,
      detail: "Download the update now and install it when it is ready.",
    })

    if (response === 0) {
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "Arena Tracker update downloaded",
      detail: "Restart now to install the update.",
    })

    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on("error", (error) => {
    console.warn("Auto-update check failed:", error)
  })

  autoUpdater.checkForUpdates().catch((error) => {
    console.warn("Auto-update check failed:", error)
  })
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn("Auto-update check failed:", error)
    })
  }, 4 * 60 * 60 * 1000)
}

async function main() {
  await app.whenReady()
  const win = await createWindow()
  setupAutoUpdater(win)

  // Start monitoring for League client connection
  startConnectionMonitoring(win)

  ipcMain.on("app-ready", () => connectToLcu(win))
  ipcMain.on("connect-to-lcu", () => connectToLcu(win))

  ipcMain.on("test-custom-league-path", async (_, path: string) => {
    console.log("Testing custom League path:", path)
    const lockfilePath = lockfilePathFromLeaguePath(path)
    const credentials = parseLockfile(lockfilePath)
    if (credentials) {
      console.log("Custom path test successful!")
      await store.set('custom-league-path', path)
      win.webContents.send("custom-path-test-result", { success: true, message: "Path found and saved!" })
    } else {
      console.log("Custom path test failed - no lockfile found")
      win.webContents.send("custom-path-test-result", { success: false, message: "No lockfile found at this path" })
    }
  })

  ipcMain.handle("lcu-request", async (_, path: string) => {
    return makeLCURequest(path)
  })

  ipcMain.on("export-data", async (_, { format, data }) => {
    console.log("Exporting data in", format, "format")
    
    try {
      if (!exportFormats.has(format)) {
        throw new Error(`Unsupported export format: ${format}`)
      }

      let content: string | Buffer = ''
      let filename = `arena-tracker-export-${new Date().toISOString().split('T')[0]}`
      let fileExtension = ''
      
      switch (format) {
        case 'txt':
          content = generateTxtExport(data)
          fileExtension = '.txt'
          break
        case 'json':
          content = JSON.stringify(data, null, 2)
          fileExtension = '.json'
          break
        case 'csv':
          content = generateCsvExport(data)
          fileExtension = '.csv'
          break
      }
      
      console.log("Generated content length:", content.length)
      console.log("Opening save dialog...")
      
      const result = await dialog.showSaveDialog(win, {
        title: 'Export Arena Tracker Data',
        defaultPath: path.join(os.homedir(), 'Downloads', filename + fileExtension),
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['showOverwriteConfirmation']
      })
      
      console.log("Dialog result:", result)
      
      if (!result.canceled && result.filePath) {
        console.log("Saving to:", result.filePath)
        
        fs.writeFileSync(result.filePath, content as string, 'utf8')
        
        console.log("Export successful:", result.filePath)
        win.webContents.send("export-result", { success: true, message: `Data exported to ${result.filePath}` })
      } else {
        console.log("Export cancelled by user")
        win.webContents.send("export-result", { success: false, message: "Export cancelled" })
      }
    } catch (error) {
      console.error("Export failed:", error)
      const message = error instanceof Error ? error.message : String(error)
      win.webContents.send("export-result", { success: false, message: `Export failed: ${message}` })
    }
  })

  ipcMain.on("store-set", (_, key, value) => {
    if (!storeKeys.has(key) || typeof value !== "string") return
    store.set(key, value)
  })

  ipcMain.handle("store-get", (_e, arg: string) => {
    if (!storeKeys.has(arg)) return undefined
    return store.get(arg)
  })

  app.on("window-all-closed", () => {
    app.quit()
  })

  ipcMain.on("process:close", () => {
    app.quit()
  })
}

main()
