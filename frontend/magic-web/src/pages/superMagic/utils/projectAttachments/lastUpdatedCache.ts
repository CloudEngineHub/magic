const projectLastUpdatedCache = new Map<string, string>()
const projectLastUpdatedListeners = new Map<string, Set<(lastUpdatedAt: string) => void>>()

// WS incremental apply and manual polling share last_updated_at to avoid duplicate fetches.
export function markProjectAttachmentsLastUpdated(projectId?: string, lastUpdatedAt?: string) {
	if (!projectId || !lastUpdatedAt) return
	projectLastUpdatedCache.set(projectId, lastUpdatedAt)
	projectLastUpdatedListeners.get(projectId)?.forEach((listener) => listener(lastUpdatedAt))
}

export function getProjectAttachmentsLastUpdated(projectId?: string) {
	if (!projectId) return ""
	return projectLastUpdatedCache.get(projectId) || ""
}

export function clearProjectAttachmentsLastUpdated(projectId?: string) {
	if (!projectId) return
	projectLastUpdatedCache.delete(projectId)
}

export function subscribeProjectAttachmentsLastUpdated(
	projectId: string | undefined,
	listener: (lastUpdatedAt: string) => void,
) {
	// Each polling instance has its own ref; sync WS updates into those refs.
	if (!projectId) return undefined
	const listeners = projectLastUpdatedListeners.get(projectId) || new Set()
	listeners.add(listener)
	projectLastUpdatedListeners.set(projectId, listeners)

	return () => {
		listeners.delete(listener)
		if (listeners.size === 0) {
			projectLastUpdatedListeners.delete(projectId)
		}
	}
}
