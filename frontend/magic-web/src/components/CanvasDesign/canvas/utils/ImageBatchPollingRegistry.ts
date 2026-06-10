import type { ImageBatchPollingManager } from "./ImageBatchPollingManager"

export class ImageBatchPollingRegistry {
	private readonly activeManagers = new Set<ImageBatchPollingManager>()

	public track(manager: ImageBatchPollingManager): void {
		this.activeManagers.add(manager)
	}

	public untrack(manager: ImageBatchPollingManager): void {
		this.activeManagers.delete(manager)
	}

	public destroy(): void {
		this.activeManagers.forEach((manager) => {
			manager.stop()
		})
		this.activeManagers.clear()
	}
}
