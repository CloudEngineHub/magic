import { IStorageAdapter } from "./IStorageAdapter"
import { logger as Logger } from "@/utils/log"

const logger = Logger.createLogger("LocalStorageAdapter")

/**
 * LocalStorage adapter for Web platform
 * Wraps synchronous localStorage API into async interface
 */
export class LocalStorageAdapter implements IStorageAdapter {
	/**
	 * Get item from localStorage
	 */
	async getItem(key: string): Promise<string | null> {
		try {
			return window.localStorage.getItem(key)
		} catch (error) {
			logger.error({
				eventKey: "get_item_local_storage_failed",
				errorKind: "storage",
				error: error,
				message: "Failed to get item from localStorage",
				context: { key },
			})
			return null
		}
	}

	/**
	 * Set item in localStorage
	 */
	async setItem(key: string, value: string): Promise<void> {
		try {
			window.localStorage.setItem(key, value)
		} catch (error) {
			logger.error({
				eventKey: "set_item_local_storage_failed",
				errorKind: "storage",
				error: error,
				message: "Failed to set item in localStorage",
				context: { key },
			})
			throw error
		}
	}

	/**
	 * Remove item from localStorage
	 */
	async removeItem(key: string): Promise<void> {
		try {
			window.localStorage.removeItem(key)
		} catch (error) {
			logger.error({
				eventKey: "remove_item_local_storage_failed",
				errorKind: "storage",
				error: error,
				message: "Failed to remove item from localStorage",
				context: { key },
			})
			throw error
		}
	}

	/**
	 * Clear all items from localStorage
	 */
	async clear(): Promise<void> {
		try {
			window.localStorage.clear()
		} catch (error) {
			logger.error({
				eventKey: "clear_local_storage_failed",
				errorKind: "storage",
				error: error,
				message: "Failed to clear localStorage",
			})
			throw error
		}
	}
}
