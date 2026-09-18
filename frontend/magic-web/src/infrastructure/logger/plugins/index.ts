// Pure exports: importing a plugin never observes the browser or installs it.
export { createDevicePlugin } from "./device"
export { createGlobalErrorPlugin } from "./globalError"
export { createFetchPlugin, type FetchPluginOptions } from "./fetch"
export { createPageDwellPlugin } from "./pageDwell"
export { createResourcePlugin, type ResourceCollectorOptions } from "./resource"
export { createStorageQuotaPlugin } from "./storageQuota"
export type { LoggerPlugin, LoggerPluginContext } from "../types"
