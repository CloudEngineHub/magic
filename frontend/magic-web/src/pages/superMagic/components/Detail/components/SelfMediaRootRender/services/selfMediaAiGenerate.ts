/**
 * Self-Media AI Generation Service
 *
 * Facade for AI-assisted generation in the self-media init panel.
 * Prompts live in selfMediaAiPromptBuilder; parsing/normalization in selfMediaAiNormalize.
 */

import { aiLLMService } from "@/services/ai"
import type { LLMMessage, StreamChunkHandler } from "@/services/ai"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
	OutlineNode,
} from "../components/SelfMediaInitPanel/types"
import {
	buildArticleDetailsPrompt,
	buildCardContentPrompt,
	buildOptimizeCardContentPrompt,
	buildOptimizeOutlinePrompt,
	buildOutlinePrompt,
	buildPolishTextPrompt,
	buildStreamOutlinePrompt,
	buildStreamTopicsPrompt,
	buildTopicsPrompt,
	buildTopicsWithDetailsPrompt,
	getArticleDetailsSystemPrompt,
	getCardContentSystemPrompt,
	getContentLocale,
	getJsonPlanningSystemPrompt,
	getOptimizeCardContentSystemPrompt,
	getOptimizeOutlineSystemPrompt,
	getOutlineSystemPrompt,
	getPlatformLabel,
	getStylePresetValues,
} from "./selfMediaAiPromptBuilder"
import {
	buildCardContentResult,
	cleanJsonFromLlm,
	isCardPlatform,
	parseCardContentFromText,
	parseOutlineFromText,
	reconcileCardCountWithOutline,
} from "./selfMediaAiNormalize"

export { parseOutlineFromText, reconcileCardCountWithOutline } from "./selfMediaAiNormalize"

// ─── 选题生成 ────────────────────────────────────────────────────────────────

export interface GenerateTopicsOptions {
	global: SelfMediaInitGlobalSettings
	count?: number
	direction?: string
	referenceText?: string
	model?: string
	signal?: AbortSignal
}

export interface GeneratedTopic {
	title: string
	description: string
}

export async function generateTopics(options: GenerateTopicsOptions): Promise<GeneratedTopic[]> {
	const { global, count = 5, direction, referenceText, model, signal } = options
	const locale = getContentLocale()
	const prompt = buildTopicsPrompt(global, count, direction, referenceText, locale)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.8,
		model,
		signal,
		systemPrompt: getJsonPlanningSystemPrompt(locale),
	})

	try {
		const topics = JSON.parse(cleanJsonFromLlm(result.content)) as GeneratedTopic[]
		return Array.isArray(topics) ? topics.slice(0, count) : []
	} catch {
		return []
	}
}

// ─── 选题 + 详情一体化生成 ──────────────────────────────────────────────────────

export interface GenerateTopicsWithDetailsOptions {
	global: SelfMediaInitGlobalSettings
	count?: number
	direction?: string
	referenceText?: string
	model?: string
	signal?: AbortSignal
}

export interface GeneratedTopicWithDetails {
	title: string
	description: string
	platform: string
	style: string
	visualPreset?: string
	cardCount: number
	outline: string
}

export async function generateTopicsWithDetails(
	options: GenerateTopicsWithDetailsOptions,
): Promise<GeneratedTopicWithDetails[]> {
	const { global, count = 5, direction, referenceText, model, signal } = options
	const locale = getContentLocale()
	const styleValues = getStylePresetValues()
	const prompt = buildTopicsWithDetailsPrompt(
		global,
		count,
		direction,
		referenceText,
		styleValues,
		locale,
	)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.8,
		model,
		signal,
		systemPrompt: getJsonPlanningSystemPrompt(locale),
	})

	try {
		const topics = JSON.parse(cleanJsonFromLlm(result.content)) as GeneratedTopicWithDetails[]
		if (!Array.isArray(topics)) return []

		for (const topic of topics) {
			topic.cardCount = reconcileCardCountWithOutline(
				topic.platform,
				topic.cardCount,
				[],
				topic.outline,
			)
		}
		return topics.slice(0, count)
	} catch {
		return []
	}
}

// ─── 大纲生成 ────────────────────────────────────────────────────────────────

export interface GenerateOutlineOptions {
	global: SelfMediaInitGlobalSettings
	article: ArticleDetail
	model?: string
	signal?: AbortSignal
}

export async function generateOutline(options: GenerateOutlineOptions): Promise<OutlineNode[]> {
	const { global, article, model, signal } = options
	const locale = getContentLocale()
	const prompt = buildOutlinePrompt(global, article, locale)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt: getOutlineSystemPrompt(locale),
	})

	return parseOutlineFromText(result.content)
}

export interface OptimizeOutlineOptions extends GenerateOutlineOptions {
	instruction: string
}

export async function optimizeOutline(options: OptimizeOutlineOptions): Promise<OutlineNode[]> {
	const { global, article, model, signal, instruction } = options
	const locale = getContentLocale()
	const prompt = buildOptimizeOutlinePrompt(global, article, instruction, locale)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt: getOptimizeOutlineSystemPrompt(locale),
	})

	return parseOutlineFromText(result.content)
}

// ─── 卡片内容生成（小红书/Instagram） ────────────────────────────────────────────

export interface GeneratedCardContent {
	outline: OutlineNode[]
	cardCount: number
}

export async function generateCardContent(
	options: GenerateOutlineOptions,
): Promise<GeneratedCardContent> {
	const { global, article, model, signal } = options
	const locale = getContentLocale()
	const fallbackCardCount = article.cardCount || 6
	const prompt = buildCardContentPrompt(global, article, fallbackCardCount, locale)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt: getCardContentSystemPrompt(locale),
	})

	const outline = parseCardContentFromText(result.content)
	return buildCardContentResult(outline, fallbackCardCount)
}

export interface OptimizeCardContentOptions extends GenerateOutlineOptions {
	instruction: string
}

export async function optimizeCardContent(
	options: OptimizeCardContentOptions,
): Promise<GeneratedCardContent> {
	const { global, article, model, signal, instruction } = options
	const locale = getContentLocale()
	const fallbackCardCount = article.cardCount || 6
	const prompt = buildOptimizeCardContentPrompt(
		global,
		article,
		fallbackCardCount,
		instruction,
		locale,
	)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt: getOptimizeCardContentSystemPrompt(locale),
	})

	const outline = parseCardContentFromText(result.content)
	return buildCardContentResult(outline, fallbackCardCount)
}

// ─── 流式生成 ─────────────────────────────────────────────────────────────────

export interface StreamGenerateOptions {
	global: SelfMediaInitGlobalSettings
	article?: ArticleDetail
	type: "topics" | "outline"
	direction?: string
	count?: number
	onChunk: StreamChunkHandler
	signal?: AbortSignal
}

export function streamGenerate(options: StreamGenerateOptions): { abort: () => void } {
	const { global, article, type, direction, count = 5, onChunk, signal } = options
	const locale = getContentLocale()

	const prompt =
		type === "topics"
			? buildStreamTopicsPrompt(global, count, direction, locale)
			: buildStreamOutlinePrompt(article!, locale)

	const messages: LLMMessage[] = [{ role: "user", content: prompt }]
	return aiLLMService.stream(messages, onChunk, { temperature: 0.7, signal })
}

// ─── 文章详情智能填充 ──────────────────────────────────────────────────────────

export interface GenerateArticleDetailsOptions {
	global: SelfMediaInitGlobalSettings
	article: ArticleDetail
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

export async function generateArticleDetails(
	options: GenerateArticleDetailsOptions,
): Promise<GeneratedArticleDetails> {
	const { global, article, model, signal } = options
	const platform = getPlatformLabel(article.platform)
	const cardPlatform = isCardPlatform(article.platform)
	const locale = getContentLocale()
	const styleValues = getStylePresetValues()
	const prompt = buildArticleDetailsPrompt(
		global,
		article,
		platform,
		styleValues,
		cardPlatform,
		locale,
	)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.7,
		model,
		signal,
		systemPrompt: getArticleDetailsSystemPrompt(locale),
	})

	try {
		const parsed = JSON.parse(cleanJsonFromLlm(result.content))
		const outlineText = typeof parsed.outline === "string" ? parsed.outline : ""
		const outline = outlineText ? parseOutlineFromText(outlineText) : []
		const cardCount = reconcileCardCountWithOutline(
			article.platform,
			parsed.cardCount,
			outline,
			outlineText,
		)

		return {
			style: parsed.style || "professional",
			visualPreset: parsed.visualPreset || "none",
			cardCount,
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
	context?: string
	model?: string
	signal?: AbortSignal
}

export async function polishText(options: PolishTextOptions): Promise<string> {
	const { text, context, model, signal } = options
	const prompt = buildPolishTextPrompt(text, context)
	const messages: LLMMessage[] = [{ role: "user", content: prompt }]

	const result = await aiLLMService.chat(messages, {
		temperature: 0.5,
		model,
		signal,
		systemPrompt: "你是一个文案润色助手。直接输出润色后的文字。",
	})

	return result.content.trim()
}
