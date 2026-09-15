import { downloadFileContent } from "@/pages/superMagic/utils/api"
import { isRelativePath } from "../../../contents/HTML/utils"

export interface SlideLoadOptions {
	signal?: AbortSignal
}

/**
 * SlideLoaderService - Responsible for downloading slide content
 * Pure service layer without state management
 */
export class SlideLoaderService {
	/**
	 * Load slide content from URL
	 * @param url - Slide URL to download
	 * @param options - Download options
	 * @returns Raw HTML content string
	 */
	async loadSlide(url: string, options: SlideLoadOptions = {}): Promise<string> {
		if (!url) {
			throw new Error("Slide URL is required")
		}

		if (isRelativePath(url)) {
			return ""
		}

		try {
			const content = await downloadFileContent(url, { signal: options.signal })
			return typeof content === "string" ? content : ""
		} catch (error) {
			if (options.signal?.aborted) throw error
			console.error(`Failed to load slide from URL: ${url}`, error)
			throw error
		}
	}

	/**
	 * Load multiple slides in parallel
	 * @param urls - Array of slide URLs
	 * @param options - Download options shared by every slide request
	 * @returns Map of index to content
	 */
	async loadSlides(urls: string[], options: SlideLoadOptions = {}): Promise<Map<number, string>> {
		const results = new Map<number, string>()

		const loadPromises = urls.map(async (url, index) => {
			try {
				const content = await this.loadSlide(url, options)
				return { index, content }
			} catch (error) {
				// Cancellation must stop the batch instead of being persisted as empty slide content.
				if (options.signal?.aborted) throw error

				console.error(`Failed to load slide at index ${index}:`, error)
				return { index, content: "" }
			}
		})

		const loadedSlides = await Promise.all(loadPromises)

		loadedSlides.forEach(({ index, content }) => {
			results.set(index, content)
		})

		return results
	}
}
