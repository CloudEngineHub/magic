import type { ImageBatchPollingManager } from "./ImageBatchPollingManager"

export class ImageBatchPollingRegistry {
	private readonly activeManagers = new Set<ImageBatchPollingManager>()
	private readonly activeImageIds = new Set<string>()

	public track(manager: ImageBatchPollingManager): void {
		this.activeManagers.add(manager)
		this.activeImageIds.add(manager.getImageId())
	}

	public untrack(manager: ImageBatchPollingManager): void {
		this.activeManagers.delete(manager)
		this.activeImageIds.delete(manager.getImageId())
	}

	public has(imageId: string): boolean {
		return this.activeImageIds.has(imageId)
	}

	public get(imageId: string): ImageBatchPollingManager | undefined {
		return Array.from(this.activeManagers).find((manager) => manager.getImageId() === imageId)
	}

	public destroy(): void {
		this.activeManagers.forEach((manager) => {
			manager.stop()
		})
		this.activeManagers.clear()
		this.activeImageIds.clear()
	}
}
