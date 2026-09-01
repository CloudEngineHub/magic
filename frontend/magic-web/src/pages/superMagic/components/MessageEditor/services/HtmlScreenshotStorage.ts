import { ImageStorageDatabase } from "@/services/tiptap-image-storage"
import { base64ToFile } from "../utils/fileConverter"

const SCREENSHOT_RETENTION_DAYS = 1

export interface StoredHtmlScreenshot {
	storageId: string
	fileName: string
	fileSize: number
	file: File
}

/** Local screenshot storage; ImageStorageDatabase runs expiry cleanup every 24 hours. */
class HtmlScreenshotStorage {
	private readonly imageStorage = ImageStorageDatabase.getInstance()

	async store(dataUrl: string, fileName: string): Promise<StoredHtmlScreenshot> {
		const file = await base64ToFile(dataUrl, fileName)
		const storageId = await this.imageStorage.saveImage(file, SCREENSHOT_RETENTION_DAYS)
		return { storageId, fileName: file.name, fileSize: file.size, file }
	}

	getBlob(storageId: string): Promise<Blob | null> {
		return this.imageStorage.getImage(storageId)
	}

	delete(storageId: string): Promise<void> {
		return this.imageStorage.deleteImage(storageId)
	}
}

export const htmlScreenshotStorage = new HtmlScreenshotStorage()
