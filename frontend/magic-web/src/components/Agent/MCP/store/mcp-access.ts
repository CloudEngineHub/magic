import { MCPStorageService, ProjectStorage } from "../service/MCPStorageService"
import mcpTempStorage from "@/components/business/AccountSetting/pages/ScheduledTasks/store/MCPTempStorage"
import { MCPStore, defaultMCPStore } from "./mcp-store"

interface GetMCPAccessParams {
	storageKey?: string
	useTempStorage?: boolean
}

const projectMCPStoreMap = new Map<string, MCPStore>()
const tempMCPStore = new MCPStore(new MCPStorageService(mcpTempStorage), "items")
const LEGACY_MCP_MIGRATION_STORAGE_KEY = "magic_mcp_legacy_migration_v1"

type LegacyMCPMigrationRecord = Record<string, string[]>

function readLegacyMigrationRecord(): LegacyMCPMigrationRecord {
	if (typeof window === "undefined") return {}
	try {
		const value = window.localStorage.getItem(LEGACY_MCP_MIGRATION_STORAGE_KEY)
		return value ? (JSON.parse(value) as LegacyMCPMigrationRecord) : {}
	} catch {
		return {}
	}
}

function writeLegacyMigrationRecord(record: LegacyMCPMigrationRecord) {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(LEGACY_MCP_MIGRATION_STORAGE_KEY, JSON.stringify(record))
	} catch {
		// Storage may be unavailable in private browsing or restricted environments.
	}
}

interface LoadMCPWithLegacyCompatibilityParams {
	addedAccess: MCPStore
	legacyAccess: MCPStore
	legacyStorageKey: string
}

/**
 * Load the new added-connector bucket and the legacy project bucket together.
 * Legacy project entries represented both "added" and "enabled" in the old UI,
 * so missing entries are silently merged into the new bucket. The local marker
 * prevents a connector removed in the new UI from being re-added on every load.
 */
export async function loadMCPWithLegacyCompatibility({
	addedAccess,
	legacyAccess,
	legacyStorageKey,
}: LoadMCPWithLegacyCompatibilityParams) {
	if (addedAccess === legacyAccess) {
		await addedAccess.load()
		return
	}

	const [addedResult, legacyResult] = await Promise.allSettled([
		addedAccess.load(),
		legacyAccess.load(),
	])
	if (addedResult.status === "rejected" || legacyResult.status === "rejected") return

	const currentItems = addedAccess.mcpList
	const legacyItems = legacyAccess.mcpList.filter((item) => Boolean(item?.id?.trim()))
	if (legacyItems.length === 0) return

	const currentIds = new Set(currentItems.map((item) => item.id))
	const migrationRecord = readLegacyMigrationRecord()
	const migratedIds = new Set(migrationRecord[legacyStorageKey] ?? [])
	const pendingItems = legacyItems.filter((item) => !migratedIds.has(item.id))
	const missingItems = pendingItems.filter((item) => !currentIds.has(item.id))

	if (missingItems.length > 0) {
		await addedAccess.save({
			selectedIds: new Set([...currentIds, ...missingItems.map((item) => item.id)]),
			items: [...currentItems, ...missingItems],
		})
	}

	if (pendingItems.length > 0) {
		migrationRecord[legacyStorageKey] = [
			...(migrationRecord[legacyStorageKey] ?? []),
			...pendingItems.map((item) => item.id),
		]
		writeLegacyMigrationRecord(migrationRecord)
	}
}

export function getMCPAccess(params: GetMCPAccessParams = {}) {
	const { storageKey, useTempStorage = false } = params

	if (useTempStorage) return tempMCPStore
	if (!storageKey) return defaultMCPStore

	const cachedStore = projectMCPStoreMap.get(storageKey)
	if (cachedStore) return cachedStore

	const projectStore = new MCPStore(new MCPStorageService(new ProjectStorage(storageKey)))
	projectMCPStoreMap.set(storageKey, projectStore)
	return projectStore
}
