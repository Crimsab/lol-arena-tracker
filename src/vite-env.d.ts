/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  arenaAPI: {
    appReady: () => void
    connectToLCU: () => void
    testCustomLeaguePath: (path: string) => void
    exportData: (payload: unknown) => void
    setStore: (key: string, value: string) => void
    getStore: (key: string) => Promise<string | undefined>
    lcuRequest: <T>(path: string) => Promise<T>
    close: () => void
    onCredentials: (
      callback: (payload: import("./types/lcu").LCUCredentials | null) => void
    ) => () => void
    onEndOfGame: (callback: () => void) => () => void
    onRefetch: (callback: () => void) => () => void
    onCustomPathTestResult: (
      callback: (payload: { success: boolean; message: string }) => void
    ) => () => void
    onExportResult: (
      callback: (payload: { success: boolean; message: string }) => void
    ) => () => void
  }
}
