import type { SelfMediaPlatform } from "../../../../types"
import type { JSONContent } from "@tiptap/react"

/** An outline node in the tree structure */
export interface OutlineNode {
	id: string
	text: string
	children?: OutlineNode[]
	/** Optional reference attachments bound to this outline point */
	materials?: MaterialItem[]
}

/** Reference file (local upload or project file) */
export interface ReferenceFileValue {
	name: string
	content: string
	/** text content or data-url for binary/image files */
	kind?: "text" | "data-url"
	/** Present when file was picked from the project workspace */
	file_id?: string
	/** Workspace-relative path, e.g. "posts/foo/ref.png" */
	file_path?: string
}

/** A material item with file and description */
export interface MaterialItem {
	/** Unique id for list key */
	id: string
	/** The File object (local, before upload) */
	file: File
	/** Local preview URL (object URL) */
	previewUrl: string
	/** User-provided description/note for this material */
	description: string
	/** After upload: the remote file path/key */
	uploadedPath?: string
}

/** Per-article detailed planning */
export interface ArticleDetail {
	/** Article title */
	title: string
	/** Custom folder name (optional, auto-generated if empty) */
	folderName: string
	/** Content style/tone for this article */
	style: string
	/** Visual CSS+JS preset ID (e.g. "neo-brutalism", "dark-tech", "none") */
	visualPreset?: string
	/** Tree-structured outline */
	outline: OutlineNode[]
	/** Number of cards (for card-based platforms) */
	cardCount: number
	/** Attached materials with descriptions */
	materials: MaterialItem[]
	/** Reference files for content (uploaded or picked from project) */
	referenceFiles?: ReferenceFileValue[]
	/** Additional notes/instructions */
	notes: string
	/** Target platform for this article */
	platform: SelfMediaPlatform
	/** User's casual description (voice/text input) */
	description?: string
	/** Rich JSON content for the description (used by MagicPromptEditor) */
	descriptionJson?: JSONContent
	/** Reference files for custom visual style */
	visualReferenceFiles?: ReferenceFileValue[]
	/** Rich JSON content for visual description (used by MagicPromptEditor in custom mode) */
	visualDescriptionJson?: JSONContent
}

/** A brand image/asset uploaded by the user */
export interface BrandImageItem {
	/** Unique id for list key */
	id: string
	/** The File object (local, before upload) */
	file: File
	/** Local preview URL (object URL for images) */
	previewUrl: string
	/** User-provided description/note for this brand image */
	description: string
	/** Whether this file is an image (for preview) */
	isImage: boolean
	/** After upload: the remote file path/key */
	uploadedPath?: string
}

/** Global settings collected in brand info step */
export interface SelfMediaInitGlobalSettings {
	/** Account/author name */
	author: string
	/** Brand/IP positioning (one sentence) */
	brandPosition: string
	/** Target audience (optional) */
	targetAudience: string
	/** Brand image/IP assets for image generation reference */
	brandImages: BrandImageItem[]
}

/** Full data model for the init panel */
export interface SelfMediaInitData {
	global: SelfMediaInitGlobalSettings
	articles: ArticleDetail[]
}

/** Style presets — labels resolved via i18n key: selfMedia.initPanel.styles.{value} */
export const STYLE_PRESETS = [
	{ value: "professional", labelKey: "detail.selfMedia.initPanel.styles.professional" },
	{ value: "casual", labelKey: "detail.selfMedia.initPanel.styles.casual" },
	{ value: "storytelling", labelKey: "detail.selfMedia.initPanel.styles.storytelling" },
	{ value: "tutorial", labelKey: "detail.selfMedia.initPanel.styles.tutorial" },
	{ value: "emotional", labelKey: "detail.selfMedia.initPanel.styles.emotional" },
	{ value: "custom", labelKey: "detail.selfMedia.initPanel.styles.custom" },
] as const

/** Platforms that are currently implemented */
export const IMPLEMENTED_PLATFORMS: SelfMediaPlatform[] = [
	"rednote",
	"instagram",
	"wechat-official-accounts",
]

/** All platforms including upcoming — labels resolved via i18n key: selfMedia.initPanel.platforms.{value} */
export const ALL_PLATFORMS: Array<{
	value: SelfMediaPlatform
	labelKey: string
	disabled: boolean
}> = [
	{ value: "rednote", labelKey: "detail.selfMedia.initPanel.platforms.rednote", disabled: false },
	{
		value: "instagram",
		labelKey: "detail.selfMedia.initPanel.platforms.instagram",
		disabled: false,
	},
	{
		value: "wechat-official-accounts",
		labelKey: "detail.selfMedia.initPanel.platforms.wechatOfficialAccounts",
		disabled: false,
	},
	{ value: "tiktok", labelKey: "detail.selfMedia.initPanel.platforms.tiktok", disabled: true },
	{ value: "x", labelKey: "detail.selfMedia.initPanel.platforms.x", disabled: true },
	{
		value: "facebook",
		labelKey: "detail.selfMedia.initPanel.platforms.facebook",
		disabled: true,
	},
	{
		value: "wechat-channels",
		labelKey: "detail.selfMedia.initPanel.platforms.wechatChannels",
		disabled: true,
	},
]

/** Visual presets organized by platform — maps to backend skill presets/ directory */
export interface VisualPresetOption {
	value: string
	labelKey: string
	descriptionKey: string
	platforms: SelfMediaPlatform[]
	/** CSS gradient or color hint used as a mini-preview swatch */
	swatch?: string
	/** Emoji or short icon character for quick identification */
	icon?: string
}

export const VISUAL_PRESETS: VisualPresetOption[] = [
	{
		value: "neo-brutalism",
		labelKey: "detail.selfMedia.initPanel.visuals.neoBrutalism.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.neoBrutalism.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #48dbfb 100%)",
		icon: "🟧",
	},
	{
		value: "code-dispatch",
		labelKey: "detail.selfMedia.initPanel.visuals.codeDispatch.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.codeDispatch.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #0f1923 0%, #1a3a4a 50%, #00d2d3 100%)",
		icon: "💻",
	},
	{
		value: "dark-tech",
		labelKey: "detail.selfMedia.initPanel.visuals.darkTech.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.darkTech.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #d4af37 100%)",
		icon: "⚡",
	},
	{
		value: "gradient-editorial",
		labelKey: "detail.selfMedia.initPanel.visuals.gradientEditorial.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.gradientEditorial.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #a78bfa 100%)",
		icon: "🟣",
	},
	{
		value: "personal-insight",
		labelKey: "detail.selfMedia.initPanel.visuals.personalInsight.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.personalInsight.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #ffffff 0%, #f0f7ff 50%, #1a73e8 100%)",
		icon: "📝",
	},
	{
		value: "product-launch-preset",
		labelKey: "detail.selfMedia.initPanel.visuals.productLaunch.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.productLaunch.description",
		platforms: ["rednote"],
		swatch: "linear-gradient(135deg, #FFFFFF 0%, #FFF5F5 50%, #E63946 100%)",
		icon: "🚀",
	},

	{
		value: "ins-modern",
		labelKey: "detail.selfMedia.initPanel.visuals.insModern.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.insModern.description",
		platforms: ["instagram"],
		swatch: "linear-gradient(135deg, #ffffff 0%, #f8f9fa 50%, #e9ecef 100%)",
		icon: "✨",
	},
	{
		value: "custom",
		labelKey: "detail.selfMedia.initPanel.visuals.custom.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.custom.description",
		platforms: ["rednote", "instagram", "wechat-official-accounts"],
		swatch: "linear-gradient(135deg, #a29bfe 0%, #fd79a8 50%, #fdcb6e 100%)",
		icon: "🎨",
	},
	{
		value: "none",
		labelKey: "detail.selfMedia.initPanel.visuals.none.label",
		descriptionKey: "detail.selfMedia.initPanel.visuals.none.description",
		platforms: ["rednote", "instagram", "wechat-official-accounts"],
		swatch: "linear-gradient(135deg, #dfe6e9 0%, #b2bec3 100%)",
		icon: "○",
	},
]

/** Get visual presets available for a given platform */
export function getVisualPresetsForPlatform(platform: SelfMediaPlatform): VisualPresetOption[] {
	return VISUAL_PRESETS.filter((p) => p.platforms.includes(platform))
}

/** Collect article-level and outline-bound reference materials */
export function collectArticleMaterials(article: ArticleDetail): MaterialItem[] {
	const items = [...(article.materials || [])]
	const visit = (nodes: OutlineNode[]) => {
		for (const node of nodes) {
			if (node.materials?.length) items.push(...node.materials)
			if (node.children?.length) visit(node.children)
		}
	}
	visit(article.outline || [])
	return items
}

function hasMeaningfulText(value?: string): boolean {
	return Boolean(value?.trim())
}

function hasMeaningfulRichText(value: unknown): boolean {
	if (!value) return false
	if (typeof value === "string") return hasMeaningfulText(value)
	if (Array.isArray(value)) return value.some(hasMeaningfulRichText)
	if (typeof value !== "object") return false

	const record = value as Record<string, unknown>
	if (typeof record.text === "string" && hasMeaningfulText(record.text)) return true
	return Object.entries(record).some(
		([key, child]) => key !== "type" && hasMeaningfulRichText(child),
	)
}

function hasMeaningfulReferenceFile(file: ReferenceFileValue): boolean {
	return Boolean(
		hasMeaningfulText(file.name) ||
		hasMeaningfulText(file.content) ||
		hasMeaningfulText(file.file_id) ||
		hasMeaningfulText(file.file_path),
	)
}

function hasMeaningfulMaterial(material: MaterialItem): boolean {
	return Boolean(
		hasMeaningfulText(material.description) ||
		hasMeaningfulText(material.uploadedPath) ||
		material.file?.size > 0,
	)
}

function hasMeaningfulOutline(nodes: OutlineNode[] | undefined): boolean {
	if (!nodes?.length) return false
	return nodes.some(
		(node) =>
			hasMeaningfulText(node.text) ||
			node.materials?.some(hasMeaningfulMaterial) ||
			hasMeaningfulOutline(node.children),
	)
}

export function hasMeaningfulArticleDraftContent(article: ArticleDetail): boolean {
	return Boolean(
		hasMeaningfulText(article.title) ||
		hasMeaningfulText(article.description) ||
		hasMeaningfulText(article.notes) ||
		hasMeaningfulRichText(article.descriptionJson) ||
		hasMeaningfulOutline(article.outline) ||
		article.materials?.some(hasMeaningfulMaterial) ||
		article.referenceFiles?.some(hasMeaningfulReferenceFile) ||
		article.visualReferenceFiles?.some(hasMeaningfulReferenceFile) ||
		hasMeaningfulRichText(article.visualDescriptionJson),
	)
}

export function hasMeaningfulSelfMediaDraftData(data: SelfMediaInitData): boolean {
	return data.articles.some(hasMeaningfulArticleDraftContent)
}

/** Default card count by platform */
export function getDefaultCardCount(platform: SelfMediaPlatform): number {
	switch (platform) {
		case "rednote":
		case "instagram":
			return 6
		case "wechat-official-accounts":
			return 0 // not applicable
		default:
			return 6
	}
}
