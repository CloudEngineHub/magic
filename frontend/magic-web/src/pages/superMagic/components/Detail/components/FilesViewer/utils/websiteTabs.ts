import type { FileItem, TabItem, WebsitePreset } from "../types"
import baiduImagesIcon from "../assets/website-presets/baidu-images.png"
import pexelsIcon from "../assets/website-presets/pexels.png"
import xiaohongshuIcon from "../assets/website-presets/xiaohongshu.png"
import zcoolIcon from "../assets/website-presets/zcool.png"

export const WEBSITE_TAB_PREFIX = "website:"

export const WEBSITE_PRESETS: WebsitePreset[] = [
	{
		id: "letsmagic-nano-banana-pro-prompts",
		titleKey: "fileViewer.website.presets.nanoBananaPro.title",
		descriptionKey: "fileViewer.website.presets.nanoBananaPro.description",
		icon: "nano-banana-pro",
		url: "https://www.letsmagic.cn/nano-banana-pro-prompts",
	},
	{
		id: "letsmagic-gpt-image-2-prompts",
		titleKey: "fileViewer.website.presets.gptImage2.title",
		descriptionKey: "fileViewer.website.presets.gptImage2.description",
		icon: "gpt-image-2",
		url: "https://www.letsmagic.cn/gpt-image-2-prompts",
	},
	{
		id: "baidu-images",
		titleKey: "fileViewer.website.presets.baiduImages.title",
		descriptionKey: "fileViewer.website.presets.baiduImages.description",
		iconSrc: baiduImagesIcon,
		url: "https://image.baidu.com/",
	},
	{
		id: "xiaohongshu",
		titleKey: "fileViewer.website.presets.xiaohongshu.title",
		descriptionKey: "fileViewer.website.presets.xiaohongshu.description",
		iconSrc: xiaohongshuIcon,
		url: "https://www.xiaohongshu.com/",
	},
	{
		id: "zcool",
		titleKey: "fileViewer.website.presets.zcool.title",
		descriptionKey: "fileViewer.website.presets.zcool.description",
		iconSrc: zcoolIcon,
		url: "https://www.zcool.com.cn/",
	},
	{
		id: "pexels",
		titleKey: "fileViewer.website.presets.pexels.title",
		descriptionKey: "fileViewer.website.presets.pexels.description",
		iconSrc: pexelsIcon,
		url: "https://www.pexels.com/",
	},
]

function normalizeWebsiteUrl(rawUrl: string) {
	const trimmedUrl = rawUrl.trim()
	if (!trimmedUrl) return null

	const urlWithProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmedUrl)
		? trimmedUrl
		: `https://${trimmedUrl}`

	try {
		const url = new URL(urlWithProtocol)
		if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
			return null
		}
		if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
			url.protocol = "https:"
		}
		return url
	} catch {
		return null
	}
}

function isLoopbackHost(hostname: string) {
	const normalizedHostname = hostname.toLowerCase()
	return (
		normalizedHostname === "localhost" ||
		normalizedHostname.endsWith(".localhost") ||
		normalizedHostname === "127.0.0.1" ||
		normalizedHostname === "[::1]" ||
		normalizedHostname === "::1"
	)
}

export function buildCustomWebsitePreset(rawUrl: string, description = "Custom website") {
	const url = normalizeWebsiteUrl(rawUrl)
	if (!url) return null

	const slugSource = `${url.hostname}${url.pathname}${url.search}`
	const slug =
		slugSource
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "website"

	return {
		id: `custom-${slug}`,
		title: url.hostname.replace(/^www\./, ""),
		url: url.href,
		description,
	}
}

export function buildWebsiteTab(preset: WebsitePreset): TabItem {
	const tabId = `${WEBSITE_TAB_PREFIX}${preset.id}`
	const title = preset.title || preset.titleKey || preset.id
	const description = preset.description || preset.descriptionKey
	const fileData: FileItem = {
		file_id: tabId,
		file_name: title,
		display_filename: title,
		url: preset.url,
		display_config: {
			type: "website",
			name: title,
			description,
			previewPolicy: {
				persistTab: true,
				syncWithAttachments: false,
				restoreAsActive: true,
			},
		},
	}

	return {
		id: tabId,
		title,
		fileData,
		active: true,
		closeable: true,
		display_config: fileData.display_config,
	}
}

export function isWebsiteTab(
	tab: (Pick<TabItem, "id"> & Partial<Pick<TabItem, "fileData">>) | null | undefined,
) {
	return tab?.id.startsWith(WEBSITE_TAB_PREFIX) === true
}

export function getWebsiteTabData(tab: Partial<Pick<TabItem, "title" | "fileData">>) {
	return {
		title: tab.fileData?.display_config?.name || tab.title || "",
		url: tab.fileData?.url || "",
		description:
			typeof tab.fileData?.display_config?.description === "string"
				? tab.fileData.display_config.description
				: undefined,
	}
}
