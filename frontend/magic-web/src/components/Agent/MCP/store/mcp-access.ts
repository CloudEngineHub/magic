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
const legacyMigrationPromises = new Map<string, Promise<void>>()

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
async function runLegacyMCPMigration({
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
	// If the added bucket is empty, it may have been reset independently of the
	// legacy project setting. In that case, rehydrate it even when an earlier
	// migration marker exists. Once the bucket has entries, keep the marker
	// behavior so connectors deliberately removed from the new bucket are not
	// re-added on every load.
	const pendingItems =
		currentItems.length === 0
			? legacyItems
			: legacyItems.filter((item) => !migratedIds.has(item.id))
	const missingItems = pendingItems.filter((item) => !currentIds.has(item.id))

	if (missingItems.length > 0) {
		await addedAccess.save({
			selectedIds: new Set([...currentIds, ...missingItems.map((item) => item.id)]),
			items: [...currentItems, ...missingItems],
		})
	}

	if (pendingItems.length > 0) {
		migrationRecord[legacyStorageKey] = Array.from(
			new Set([
				...(migrationRecord[legacyStorageKey] ?? []),
				...pendingItems.map((item) => item.id),
			]),
		)
		writeLegacyMigrationRecord(migrationRecord)
	}
}

/**
 * Load both connector buckets and migrate legacy project entries once per
 * project at a time. Multiple input surfaces can mount together, so sharing
 * the in-flight promise prevents duplicate migration PUTs.
 */
export function loadMCPWithLegacyCompatibility(
	params: LoadMCPWithLegacyCompatibilityParams,
): Promise<void> {
	const existingPromise = legacyMigrationPromises.get(params.legacyStorageKey)
	if (existingPromise) return existingPromise

	const migrationPromise = runLegacyMCPMigration(params).finally(() => {
		if (legacyMigrationPromises.get(params.legacyStorageKey) === migrationPromise) {
			legacyMigrationPromises.delete(params.legacyStorageKey)
		}
	})
	legacyMigrationPromises.set(params.legacyStorageKey, migrationPromise)
	return migrationPromise
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
