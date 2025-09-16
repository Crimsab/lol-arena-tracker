import { app, BrowserWindow, shell, ipcMain, dialog } from "electron"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import LCUConnector from "lcu-connector"
import { WebSocket } from "ws"
import Store from "electron-store"
import * as XLSX from "xlsx"
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

const require = createRequire(import.meta.url)
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
      nodeIntegration: true,
      allowRunningInsecureContent: true,
      webSecurity: false,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
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
    if (url.startsWith("https:")) shell.openExternal(url)
    return { action: "deny" }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  return win
}

function sendCredentials(win: BrowserWindow, credentials: LCUCredentials) {
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

  win.webContents.send("credentials", credentials)
}

function parseLockfile(lockfilePath: string): LCUCredentials | null {
  try {
    if (!fs.existsSync(lockfilePath)) {
      console.log(`Lockfile not found at: ${lockfilePath}`)
      return null
    }

    const content = fs.readFileSync(lockfilePath, 'utf8').trim()
    console.log(`Found lockfile content: ${content}`)

    const parts = content.split(':')
    if (parts.length !== 5) {
      console.error(`Invalid lockfile format. Expected 5 parts, got ${parts.length}`)
      return null
    }

    const [processName, pid, port, password, protocol] = parts

    if (processName !== 'LeagueClient') {
      console.error(`Invalid process name in lockfile: ${processName}`)
      return null
    }

    const credentials: LCUCredentials = {
      address: '127.0.0.1',
      port: parseInt(port, 10),
      username: 'riot',
      password: password,
      protocol: protocol as 'http' | 'https'
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
  if (customPath) {
    possiblePaths.unshift(`${customPath}\\lockfile`)
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
    const event: LCUEventMessage = parseEventMessage(e.toString())
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
    isConnected = false
    // Send null credentials to indicate disconnection
    win.webContents.send("credentials", null)
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
    isConnected = false
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

    console.log("Manual connection failed, falling back to lcu-connector library...")

    // Fall back to lcu-connector library
    const connector = new LCUConnector()
    let wsTimeout: NodeJS.Timeout

    console.log("LCU Connector: Starting connection attempt...")

    connector.on("connect", (credentials) => {
      console.log("LCU Connector: Connected! Credentials received:", {
        address: credentials.address,
        port: credentials.port,
        protocol: credentials.protocol
      })
      sendCredentials(win, credentials)
      // LCU refuses websocket connections too early
      wsTimeout = setTimeout(() => connectWebsocket(win, credentials), 10000)
    })

    connector.on("disconnect", () => {
      console.log("LCU Connector: Disconnected!")
      clearTimeout(wsTimeout)
      return sendCredentials(win, null)
    })

    console.log("LCU Connector: Calling connector.start()")
    connector.start()
  })
}

// Configure store for portable mode
const store = new Store({
  cwd: process.env.PORTABLE_EXECUTABLE_DIR || undefined, // Use portable directory if available
  name: 'arena-tracker-config'
})

// Track connection status
let isConnected = false
let connectionCheckInterval: NodeJS.Timeout
let lastCredentials: LCUCredentials | null = null

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
    content += `${champ.id},"${champ.name}","${champ.alias}","${roles}","${completed}"\n`
  })
  return content
}

function startConnectionMonitoring(win: BrowserWindow) {
  // Check for connection every 5 seconds
  connectionCheckInterval = setInterval(async () => {
    if (!isConnected) {
      console.log("Checking for League client connection...")
      const success = await tryManualLCUConnection(win)
      if (success) {
        isConnected = true
        clearInterval(connectionCheckInterval)
      }
    }
  }, 5000)
}

function stopConnectionMonitoring() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval)
  }
}

async function main() {
  await app.whenReady()
  const win = await createWindow()

  // Start monitoring for League client connection
  startConnectionMonitoring(win)

  ipcMain.on("app-ready", () => connectToLcu(win))
  ipcMain.on("connect-to-lcu", () => connectToLcu(win))

  ipcMain.on("test-custom-league-path", async (_, path: string) => {
    console.log("Testing custom League path:", path)
    const lockfilePath = `${path}\\lockfile`
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

  ipcMain.on("export-data", async (_, { format, data }) => {
    console.log("Exporting data in", format, "format")
    console.log("Data received:", JSON.stringify(data, null, 2))
    
    try {
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
        case 'excel':
          // Generate Excel file
          const workbook = XLSX.utils.book_new()
          
          // Create summary sheet
          const summaryData = [
            ['Arena Tracker Export'],
            [''],
            ['Challenge Name', data.challengeName],
            ['Challenge Description', data.challengeDescription],
            ['Total Champions', data.totalChampions],
            ['Completed Champions', data.completedChampions],
            ['Completion Percentage', `${data.completionPercentage}%`],
            ['Export Date', data.exportDate],
            [''],
            ['Champion Details:']
          ]
          
          const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
          XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
          
          // Create champions sheet
          const championsData = [
            ['ID', 'Name', 'Alias', 'Roles', 'Completed']
          ]
          
          data.champions.forEach(champ => {
            championsData.push([
              champ.id,
              champ.name,
              champ.alias,
              champ.roles.join(', '),
              champ.completed ? 'Yes' : 'No'
            ])
          })
          
          const championsSheet = XLSX.utils.aoa_to_sheet(championsData)
          XLSX.utils.book_append_sheet(workbook, championsSheet, 'Champions')
          
          // Generate Excel buffer
          const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
          content = excelBuffer
          fileExtension = '.xlsx'
          break
      }
      
      console.log("Generated content length:", content.length)
      console.log("Opening save dialog...")
      
      const result = await dialog.showSaveDialog(win, {
        title: 'Export Arena Tracker Data',
        defaultPath: path.join(os.homedir(), 'Downloads', filename + fileExtension),
        filters: [
          { name: 'Excel Files', extensions: ['xlsx'] },
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
        
        // Write file with appropriate encoding based on format
        if (format === 'excel') {
          fs.writeFileSync(result.filePath, content as Buffer)
        } else {
          fs.writeFileSync(result.filePath, content as string, 'utf8')
        }
        
        console.log("Export successful:", result.filePath)
        win.webContents.send("export-result", { success: true, message: `Data exported to ${result.filePath}` })
      } else {
        console.log("Export cancelled by user")
        win.webContents.send("export-result", { success: false, message: "Export cancelled" })
      }
    } catch (error) {
      console.error("Export failed:", error)
      win.webContents.send("export-result", { success: false, message: `Export failed: ${error.message}` })
    }
  })

  ipcMain.on("store-set", (_, key, value) => {
    store.set(key, value)
  })

  ipcMain.handle("store-get", (_e, arg: string) => {
    return store.get(arg)
  })

  app.on(
    "certificate-error",
    (event, _webContents, _url, _error, certificate, callback) => {
      if (
        certificate.fingerprint ===
        "sha256/TQ1pFVrt3Msu+IVgubjrrixp75XCuDFovDbcTcqTJjw="
      ) {
        event.preventDefault()
        callback(true)
      } else {
        callback(false)
      }
    }
  )

  app.on("window-all-closed", () => {
    app.quit()
  })

  ipcMain.on("process:close", () => {
    process.exit(0)
  })
}

app.commandLine.appendSwitch("ignore-certificate-errors")

main()
