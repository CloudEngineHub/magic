/**
 * Self-Media AI Generation Service
 *
 * Provides AI-assisted generation capabilities for the self-media init panel:
 * - Generate topics based on brand info + platform
 * - Generate outlines based on title + style
 *
 * All prompts use English structural identifiers internally.
 * User-facing content (titles, outlines) is generated in the user's locale.
 */

import i18n from "i18next"
import { aiLLMService } from "@/services/ai"
import type { LLMMessage, StreamChunkHandler } from "@/services/ai"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
	OutlineNode,
} from "../components/SelfMediaInitPanel/types"
import { ALL_PLATFORMS, STYLE_PRESETS } from "../components/SelfMediaInitPanel/types"

/** Resolve a platform value to its localized display label via i18n */
function getPlatformLabel(value: string): string {
	const info = ALL_PLATFORMS.find((p) => p.value === value)
	return info ? i18n.t(info.labelKey, { ns: "super" }) : value
}

/** Resolve a style value to its localized display label via i18n */
function getStyleLabel(value: string): string {
	const info = STYLE_PRESETS.find((p) => p.value === value)
	return info ? i18n.t(info.labelKey, { ns: "super" }) : value
}

/** Get the user's current content locale for prompt language selection */
function getContentLocale(): "zh" | "en" {
	const lang = i18n.language || "zh_CN"
	return lang.startsWith("en") ? "en" : "zh"
}

// ─── 选题生成 ────────────────────────────────────────────────────────────────

export interface GenerateTopicsOptions {
	global: SelfMediaInitGlobalSettings
	count?: number
	/** 额外的创作方向或关键词 */
	direction?: string
	/** 参考资料文本内容（来自用户上传的文件） */
	referenceText?: string
	/** 指定使用的模型 ID */
	model?: string
	signal?: AbortSignal
}

export interface GeneratedTopic {
	title: string
	description: string
}

/**
 * AI 生成选题列表。
 */
export async function generateTopics(options: GenerateTopicsOptions): Promise<GeneratedTopic[]> {
	const { global, count = 5, direction, referenceText, model, signal } = options
	const locale = getContentLocale()

	const prompt =
		locale === "en"
			? `You are an expert social media content strategist who specializes in creating compelling content topics for brands.

## Brand Information
- Account Name: ${global.author}
- Brand Positioning: ${global.brandPosition}
${global.targetAudience ? `- Target Audience: ${global.targetAudience}` : ""}

## Task
Generate ${count} high-quality content topics for this brand. Requirements:
1. Align with brand positioning and target audience
2. Suitable for social media content format and distribution
3. Have viral potential and engagement appeal
4. Titles should be attention-grabbing
${direction ? `\n## Direction\n${direction}` : ""}
${referenceText ? `\n## Reference Material\nUser-provided reference material for topic planning:\n${referenceText}` : ""}

## Output Format
Output strictly in the following JSON format with no other text:
[
  { "title": "Topic title", "description": "One-line content direction summary" }
]`
			: `你是一位资深自媒体内容策划专家，擅长为品牌制定有吸引力的内容选题。

## 品牌信息
- 账号名称：${global.author}
- 品牌定位：${global.brandPosition}
${global.targetAudience ? `- 目标受众：${global.targetAudience}` : ""}

## 任务
请为该品牌生成 ${count} 个优质内容选题。选题要求：
1. 贴合品牌定位和目标受众
2. 适合社交媒体的内容形式和传播特点
3. 具有话题性和传播潜力
4. 标题要有吸引力，能引发用户点击
${direction ? `\n## 创作方向\n${direction}` : ""}
${referenceText ? `\n## 参考资料\n以下是用户提供的参考资料，请结合这些内容进行选题策划：\n${referenceText}` : ""}

## 输出格式
请严格按照以下 JSON 格式输出，不要有任何其他文字：
[
  { "title": "选题标题", "description": "一句话简述内容方向" }
]`

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	const systemPrompt =
		locale === "en"
			? "You are a professional social media content planning assistant. Output strictly in JSON format with no extra text."
			: "你是一个专业的自媒体内容策划助手。请严格按照 JSON 格式输出，不要有多余的文字。"

	const result = await aiLLMService.chat(messages, {
		temperature: 0.8,
		model,
		signal,
		systemPrompt,
	})

	try {
		const cleaned = result.content
			.replace(/```json?\s*\n?/g, "")
			.replace(/```\s*$/g, "")
			.trim()
		const topics = JSON.parse(cleaned) as GeneratedTopic[]
		return Array.isArray(topics) ? topics.slice(0, count) : []
	} catch {
		return []
	}
}

// ─── 大纲生成 ────────────────────────────────────────────────────────────────

export interface GenerateOutlineOptions {
	global: SelfMediaInitGlobalSettings
	article: ArticleDetail
	/** 指定使用的模型 ID */
	model?: string
	signal?: AbortSignal
}

let outlineIdCounter = 0
function generateOutlineId(): string {
	return `ai_outline_${Date.now()}_${++outlineIdCounter}`
}

function serializeOutlineToText(nodes: OutlineNode[], depth = 0): string {
	return nodes
		.map((node) => {
			const indent = "  ".repeat(depth)
			const line = `${indent}- ${node.text}`
			const children = node.children?.length
				? "\n" + serializeOutlineToText(node.children, depth + 1)
				: ""
			return line + children
		})
		.join("\n")
}

function parseOutlineFromText(text: string): OutlineNode[] {
	const lines = text.split("\n").filter((l) => l.trim())
	const root: OutlineNode[] = []
	const stack: { nodes: OutlineNode[]; depth: number }[] = [{ nodes: root, depth: -1 }]

	for (const line of lines) {
		const match = line.match(/^(\s*)[-*•]?\s*(?:\d+[.、)]\s*)?(.+)/)
		if (!match) continue

		const indent = match[1].length
		const text = match[2].trim()
		if (!text) continue

		const node: OutlineNode = { id: generateOutlineId(), text, children: [], materials: [] }

		// 找到合适的父级
		while (stack.length > 1 && stack[stack.length - 1].depth >= indent) {
			stack.pop()
		}

		stack[stack.length - 1].nodes.push(node)
		stack.push({ nodes: node.children!, depth: indent })
	}

	return root
}

/**
 * AI 生成文章大纲。
 */
export async function generateOutline(options: GenerateOutlineOptions): Promise<OutlineNode[]> {
	const { global, article, model, signal } = options
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (getContentLocale() === "en" ? "general" : "通用")
	const locale = getContentLocale()

	const prompt =
		locale === "en"
			? `You are a professional content structure planner. Generate a clear content outline for the following article.

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
- Platform: ${platform}

## Article Information
- Title: ${article.title}
- Style: ${style}
${article.cardCount > 0 ? `- Card count: ${article.cardCount} (each card maps to one key point in the outline)` : ""}
${article.notes ? `- Additional notes: ${article.notes}` : ""}

## Requirements
1. Outline should be logically clear with proper hierarchy
2. Suitable for ${platform} content format
3. Include main points and sub-points
4. Use concise language
${article.cardCount > 0 ? `5. Number of key points should match the card count (${article.cardCount})` : ""}

## Output Format
Use indented list format with "- " markers, child levels indented by two spaces:
- First point
  - Sub-point 1
  - Sub-point 2
- Second point
  - Sub-point`
			: `你是一位专业的内容结构规划师。请为以下文章生成清晰的内容大纲。

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
- 平台：${platform}

## 文章信息
- 标题：${article.title}
- 风格：${style}
${article.cardCount > 0 ? `- 卡片数：${article.cardCount} 张（每张卡片对应大纲中的一个核心要点）` : ""}
${article.notes ? `- 补充说明：${article.notes}` : ""}

## 要求
1. 大纲需要逻辑清晰、层次分明
2. 适合${platform}平台的内容展示形式
3. 包含主要观点和子要点
4. 使用简洁精炼的语言
${article.cardCount > 0 ? `5. 核心要点数量与卡片数(${article.cardCount})相匹配` : ""}

## 输出格式
请使用层级缩进的列表格式输出大纲，使用 "- " 作为列表标记，子层级用两个空格缩进：
- 第一个要点
  - 子要点 1
  - 子要点 2
- 第二个要点
  - 子要点`

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	const systemPrompt =
		locale === "en"
			? "You are a professional content structure planner. Output the outline list directly with no extra text."
			: "你是一个专业的内容结构规划师。请直接输出大纲列表，不要有多余的开头和结尾。"

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt,
	})

	return parseOutlineFromText(result.content)
}

export interface OptimizeOutlineOptions extends GenerateOutlineOptions {
	/** User instruction for how to modify the outline */
	instruction: string
}

/**
 * AI optimize an existing outline based on user instructions.
 */
export async function optimizeOutline(options: OptimizeOutlineOptions): Promise<OutlineNode[]> {
	const { global, article, model, signal, instruction } = options
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (getContentLocale() === "en" ? "general" : "通用")
	const locale = getContentLocale()
	const currentOutline = serializeOutlineToText(article.outline)
	const userInstruction =
		instruction.trim() ||
		(locale === "en"
			? "Optimize and improve the outline while preserving the core intent."
			: "在保留核心意图的前提下优化和完善大纲。")

	const prompt =
		locale === "en"
			? `You are a professional content structure planner. Modify the following article outline according to the user's instructions.

## Current Outline
${currentOutline}

## User Instructions
${userInstruction}

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
- Platform: ${platform}

## Article Information
- Title: ${article.title}
- Style: ${style}
${article.cardCount > 0 ? `- Card count: ${article.cardCount}` : ""}
${article.notes ? `- Additional notes: ${article.notes}` : ""}

## Requirements
1. Apply the user's modification requests precisely
2. Keep logical structure with proper hierarchy
3. Suitable for ${platform} content format
4. Use concise language
${article.cardCount > 0 ? `5. Number of key points should match the card count (${article.cardCount})` : ""}

## Output Format
Use indented list format with "- " markers, child levels indented by two spaces:
- First point
  - Sub-point 1
  - Sub-point 2
- Second point`
			: `你是一位专业的内容结构规划师。请根据用户的修改意愿，调整以下文章大纲。

## 当前大纲
${currentOutline}

## 用户修改要求
${userInstruction}

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
- 平台：${platform}

## 文章信息
- 标题：${article.title}
- 风格：${style}
${article.cardCount > 0 ? `- 卡片数：${article.cardCount}` : ""}
${article.notes ? `- 补充说明：${article.notes}` : ""}

## 要求
1. 严格按照用户的修改意愿调整大纲
2. 保持逻辑清晰、层次分明
3. 适合${platform}平台的内容展示形式
4. 使用简洁精炼的语言
${article.cardCount > 0 ? `5. 核心要点数量与卡片数(${article.cardCount})相匹配` : ""}

## 输出格式
请使用层级缩进的列表格式输出大纲，使用 "- " 作为列表标记，子层级用两个空格缩进：
- 第一个要点
  - 子要点 1
  - 子要点 2
- 第二个要点`

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	const systemPrompt =
		locale === "en"
			? "You are a professional content structure planner. Output the revised outline list directly with no extra text."
			: "你是一个专业的内容结构规划师。请直接输出修改后的大纲列表，不要有多余的开头和结尾。"

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt,
	})

	return parseOutlineFromText(result.content)
}

// ─── 流式生成（用于实时展示） ─────────────────────────────────────────────────

export interface StreamGenerateOptions {
	global: SelfMediaInitGlobalSettings
	article?: ArticleDetail
	type: "topics" | "outline"
	direction?: string
	count?: number
	onChunk: StreamChunkHandler
	signal?: AbortSignal
}

/**
 * 流式 AI 生成，适用于需要实时展示生成过程的场景。
 */
export function streamGenerate(options: StreamGenerateOptions): { abort: () => void } {
	const { global, article, type, direction, count = 5, onChunk, signal } = options
	const locale = getContentLocale()

	let prompt: string

	if (type === "topics") {
		prompt =
			locale === "en"
				? `You are an expert social media content strategist.

## Brand Info
- Account: ${global.author} | Positioning: ${global.brandPosition}
${global.targetAudience ? `- Audience: ${global.targetAudience}` : ""}
${direction ? `\n## Direction\n${direction}` : ""}

Generate ${count} topics, one per line. Output titles only, no numbering, no explanation.`
				: `你是一位资深自媒体内容策划专家。

## 品牌信息
- 账号：${global.author} | 定位：${global.brandPosition}
${global.targetAudience ? `- 受众：${global.targetAudience}` : ""}
${direction ? `\n## 创作方向\n${direction}` : ""}

请生成 ${count} 个选题，每个选题一行，格式为「标题」。直接输出选题，不要编号，不要解释。`
	} else {
		const style = article ? getStyleLabel(article.style) : locale === "en" ? "general" : "通用"
		const platform = article ? getPlatformLabel(article.platform) : ""
		prompt =
			locale === "en"
				? `Generate a content outline for article "${article?.title ?? ""}" (${style} style, ${platform} platform). Use "- " list format, child levels indented by two spaces. Output outline directly.`
				: `为文章「${article?.title ?? ""}」(${style}风格，${platform}平台) 生成内容大纲。使用 "- " 列表格式，子层级两个空格缩进。直接输出大纲。`
	}

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	return aiLLMService.stream(messages, onChunk, { temperature: 0.7, signal })
}

// ─── 文章详情智能填充 ──────────────────────────────────────────────────────────

export interface GenerateArticleDetailsOptions {
	global: SelfMediaInitGlobalSettings
	article: ArticleDetail
	/** 指定使用的模型 ID */
	model?: string
	signal?: AbortSignal
}

export interface GeneratedArticleDetails {
	style: string
	visualPreset?: string
	cardCount: number
	outline: OutlineNode[]
	notes: string
}

/**
 * 基于用户输入的内容描述，AI 智能预填文章的风格、视觉模板、大纲、卡片数等信息。
 * Structured fields (style, visualPreset) always use English identifiers for reliable matching.
 */
export async function generateArticleDetails(
	options: GenerateArticleDetailsOptions,
): Promise<GeneratedArticleDetails> {
	const { global, article, model, signal } = options
	const platform = getPlatformLabel(article.platform)
	const isCardPlatform = article.platform !== "wechat-official-accounts"
	const locale = getContentLocale()

	// Always use English values for structured output to ensure reliable JSON parsing
	const styleValues = STYLE_PRESETS.filter((s) => s.value !== "custom")
		.map((s) => `"${s.value}"`)
		.join(", ")

	const prompt =
		locale === "en"
			? `You are an expert social media content strategist. Based on the user's content description, recommend the best article configuration.

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
${global.targetAudience ? `- Audience: ${global.targetAudience}` : ""}
- Platform: ${platform}

## Article Information
- Title: ${article.title}
- Content Description: ${article.description}

## Task
Recommend the following configuration:
1. **style**: Choose from [${styleValues}]
2. **visualPreset**: Choose from ["neo-brutalism", "code-dispatch", "dark-tech", "ins-modern", "none"] (considering platform: ${article.platform})
${isCardPlatform ? `3. **cardCount**: Recommended card count (integer between 6-9)` : ""}
4. **outline**: Generate structured outline (use "- " list format, child levels indented by two spaces)
5. **notes**: Additional creative notes (one sentence)

## Output Format
Output strictly in the following JSON format with no other text:
{
  "style": "chosen style value",
  "visualPreset": "chosen visual preset value",
  ${isCardPlatform ? `"cardCount": number,` : ""}
  "outline": "outline text (use newlines and indentation)",
  "notes": "additional notes"
}`
			: `你是一位资深自媒体内容策划专家。请根据用户的内容描述，智能推荐最合适的文章配置。

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
${global.targetAudience ? `- 受众：${global.targetAudience}` : ""}
- 平台：${platform}

## 文章信息
- 标题：${article.title}
- 内容描述：${article.description}

## 任务
根据上述信息，推荐以下配置：
1. **style**：从 [${styleValues}] 中选择最合适的内容风格
2. **visualPreset**：从 ["neo-brutalism", "code-dispatch", "dark-tech", "ins-modern", "none"] 中选择最合适的视觉模板（考虑平台：${article.platform}）
${isCardPlatform ? `3. **cardCount**：推荐卡片数量（6-9 之间的整数）` : ""}
4. **outline**：生成结构化大纲（使用 "- " 列表格式，子层级两个空格缩进）
5. **notes**：补充创作注意事项（一句话）

## 输出格式
请严格按以下 JSON 输出，不要有其他文字：
{
  "style": "选择的风格值（英文标识符）",
  "visualPreset": "选择的视觉模板值（英文标识符）",
  ${isCardPlatform ? `"cardCount": 数字,` : ""}
  "outline": "大纲文本（使用换行和缩进）",
  "notes": "补充说明"
}`

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	const systemPrompt =
		locale === "en"
			? "You are a professional social media content planning assistant. Output strictly in JSON format."
			: "你是一个专业的自媒体内容策划助手。请严格按照 JSON 格式输出。"

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt,
	})

	try {
		const cleaned = result.content
			.replace(/```json?\s*\n?/g, "")
			.replace(/```\s*$/g, "")
			.trim()
		const parsed = JSON.parse(cleaned)

		const outline =
			typeof parsed.outline === "string" ? parseOutlineFromText(parsed.outline) : []

		return {
			style: parsed.style || "professional",
			visualPreset: parsed.visualPreset || "none",
			cardCount: isCardPlatform
				? Math.max(1, Math.min(20, parsed.cardCount || 6))
				: article.cardCount,
			outline,
			notes: parsed.notes || "",
		}
	} catch {
		return {
			style: article.style || "professional",
			visualPreset: article.visualPreset || "none",
			cardCount: article.cardCount,
			outline: [],
			notes: "",
		}
	}
}

// ─── 文本润色 ────────────────────────────────────────────────────────────────

export interface PolishTextOptions {
	text: string
	/** 润色上下文（如文章标题、平台等） */
	context?: string
	model?: string
	signal?: AbortSignal
}

/**
 * AI 润色用户口语化输入，转为结构化、专业的文字。
 */
export async function polishText(options: PolishTextOptions): Promise<string> {
	const { text, context, model, signal } = options

	const prompt = `你是一位专业的文案编辑，擅长将口语化、随意的描述润色为清晰、专业的文字。

## 原始输入
${text}
${context ? `\n## 上下文\n${context}` : ""}

## 要求
1. 保留原文的核心意图和关键信息
2. 改善表达、消除口语化和冗余
3. 让文字更加精炼、结构化
4. 不要改变原意，不要添加没提到的内容
5. 直接输出润色后的文字，不要有任何前缀说明`

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	const result = await aiLLMService.chat(messages, {
		temperature: 0.5,
		model,
		signal,
		systemPrompt: "你是一个文案润色助手。直接输出润色后的文字。",
	})

	return result.content.trim()
}
