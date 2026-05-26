import i18n from "i18next"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
} from "../components/SelfMediaInitPanel/types"
import { ALL_PLATFORMS, STYLE_PRESETS } from "../components/SelfMediaInitPanel/types"
import { isWechatOfficialAccount, serializeOutlineToText } from "./selfMediaAiNormalize"

export type ContentLocale = "zh" | "en"

export function getContentLocale(): ContentLocale {
	const lang = i18n.language || "zh_CN"
	return lang.startsWith("en") ? "en" : "zh"
}

export function getPlatformLabel(value: string): string {
	const info = ALL_PLATFORMS.find((p) => p.value === value)
	return info ? i18n.t(info.labelKey, { ns: "super" }) : value
}

export function getStyleLabel(value: string): string {
	const info = STYLE_PRESETS.find((p) => p.value === value)
	return info ? i18n.t(info.labelKey, { ns: "super" }) : value
}

function getWechatOutlinePromptRules(locale: ContentLocale): string {
	return locale === "en"
		? `For "wechat-official-accounts" (long-form article):
- cardCount must be 0
- The outline MUST be a multi-level hierarchy (at least 2 levels; use 3 when the topic is complex)
- Each top-level item is a major section/chapter of the article (not a card)
- Every major section MUST include at least 2 indented sub-points
- Recommended structure: hook/intro → 3-5 major sections → conclusion/CTA
- Aim for 4-6 top-level sections with 2-4 sub-points each`
		: `对于 "wechat-official-accounts"（微信公众号长文）：
- cardCount 必须为 0
- 大纲必须是多级层级结构（至少 2 级；主题复杂时使用 3 级）
- 每个顶级要点对应文章的一个「大段/章节」，而非卡片
- 每个大段下必须包含至少 2 个缩进子要点
- 推荐结构：开头钩子 → 3-5 个正文大段 → 结尾总结/互动引导
- 建议 4-6 个顶级大段，每段含 2-4 个子要点`
}

function getWechatOutlineExample(locale: ContentLocale): string {
	return locale === "en"
		? `- Opening: hook with a relatable pain point
  - Describe the reader's familiar struggle
  - Pose the core question
- Section 1: context and current landscape
  - Key data or trends
  - Common misconceptions
- Section 2: core methodology
  - Step 1
  - Step 2
  - Step 3
- Section 3: practical case study
  - Background
  - Actions and results
- Closing: summary and engagement
  - Key takeaways
  - Follow/comment/share prompt`
		: `- 开头：用痛点场景引出主题
  - 描述读者熟悉的困境
  - 抛出核心问题
- 第一大段：背景与现状
  - 关键数据或趋势
  - 常见误区拆解
- 第二大段：核心方法论
  - 步骤一
  - 步骤二
  - 步骤三
- 第三大段：实战案例
  - 案例背景
  - 做法与结果
- 结尾：总结与互动引导
  - 核心要点回顾
  - 引导关注/留言/转发`
}

function getCardOutlinePromptRules(locale: ContentLocale): string {
	return locale === "en"
		? `IMPORTANT: For card platforms ("rednote", "instagram"), the number of top-level points in "outline" MUST equal "cardCount". Each top-level point corresponds to one card.`
		: `重要：对于卡片平台（"rednote" 小红书、"instagram"），outline 中的顶级要点数量必须与 cardCount 一致，每个顶级要点对应一张卡片。`
}

function getWechatOutlineGenerationRules(locale: ContentLocale): string {
	return locale === "en"
		? `5. This is a WeChat long-form article — use a multi-level outline (at least 2 levels)
6. Each top-level item is a major section/chapter; include 2-4 sub-points under each
7. Include: opening hook → 3-5 body sections → closing summary/CTA
8. Do NOT flatten into a single-level bullet list`
		: `5. 这是微信公众号长文，必须使用多级大纲（至少 2 级）
6. 每个顶级要点是一个正文大段/章节，其下需包含 2-4 个子要点
7. 结构应包含：开头钩子 → 3-5 个正文大段 → 结尾总结/互动引导
8. 禁止输出单层平铺的要点列表`
}

const DEFAULT_OUTLINE_EXAMPLE_EN = `- First point
  - Sub-point 1
  - Sub-point 2
- Second point
  - Sub-point`

const DEFAULT_OUTLINE_EXAMPLE_ZH = `- 第一个要点
  - 子要点 1
  - 子要点 2
- 第二个要点
  - 子要点`

function getOutlineExtraRequirements(
	locale: ContentLocale,
	isWechat: boolean,
	cardCount: number,
): string {
	if (isWechat) return getWechatOutlineGenerationRules(locale)
	if (cardCount > 0) {
		return locale === "en"
			? `5. Number of key points should match the card count (${cardCount})`
			: `5. 核心要点数量与卡片数(${cardCount})相匹配`
	}
	return ""
}

function getOutlineFormatExample(locale: ContentLocale, isWechat: boolean): string {
	if (isWechat) return getWechatOutlineExample(locale)
	return locale === "en" ? DEFAULT_OUTLINE_EXAMPLE_EN : DEFAULT_OUTLINE_EXAMPLE_ZH
}

function getContentDescriptionFieldRules(locale: ContentLocale): string {
	return locale === "en"
		? `"description" is the article content description (NOT a title repeat or one-line tagline). Write 2-4 sentences covering:
- What the article wants to express and its core viewpoint
- What value or insight the reader will gain
- The recommended content angle or narrative approach
Keep it concrete and actionable for downstream outline writing.`
		: `"description" 是文章「内容描述」（不是标题复述或一句话标签）。请写 2-4 句话，包含：
- 这篇文章想表达什么、核心观点是什么
- 读者能从中获得什么价值或启发
- 建议采用的内容角度或叙事方式
描述要具体、可执行，便于后续展开大纲。`
}

export function getJsonPlanningSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional social media content planning assistant. Output strictly in JSON format with no extra text."
		: "你是一个专业的自媒体内容策划助手。请严格按照 JSON 格式输出，不要有多余的文字。"
}

export function buildTopicsPrompt(
	global: SelfMediaInitGlobalSettings,
	count: number,
	direction: string | undefined,
	referenceText: string | undefined,
	locale: ContentLocale,
): string {
	return locale === "en"
		? `You are an expert social media content strategist who specializes in creating compelling content topics.

## Account Context
- Account Name: ${global.author}
${global.targetAudience ? `- Target Audience: ${global.targetAudience}` : ""}

## Task
${referenceText && !direction
			? `Analyze the following reference material and extract ${count} content topic ideas from it. The topics should be directly inspired by and derived from the reference material's themes, viewpoints, or knowledge points. Adapt them into formats suitable for social media distribution.`
			: `Generate ${count} high-quality content topics. Requirements:
1. Suitable for social media content format and distribution
2. Have viral potential and engagement appeal
3. Titles should be attention-grabbing`
		}
${direction ? `\n## Creative Direction\n${direction}` : ""}
${referenceText ? `\n## Reference Material (Primary Source)\nThe following is user-provided reference material. ${direction ? "Use it as inspiration combined with the direction above." : "Extract topic ideas directly from this material — focus on its core themes, insights, and knowledge points rather than brand marketing angles."}\n${referenceText}` : ""}
${!referenceText && global.brandPosition ? `\n## Brand Context (for tone reference only)\n- Brand Positioning: ${global.brandPosition}` : ""}

## Output Format
Output strictly in the following JSON format with no other text:
[
  { "title": "Topic title", "description": "Content description (2-4 sentences)" }
]

${getContentDescriptionFieldRules("en")}`
		: `你是一位资深自媒体内容策划专家，擅长从素材中提炼有吸引力的内容选题。

## 账号信息
- 账号名称：${global.author}
${global.targetAudience ? `- 目标受众：${global.targetAudience}` : ""}

## 任务
${referenceText && !direction
			? `请仔细分析以下参考资料，从中提炼出 ${count} 个内容选题。选题应直接来源于参考资料中的主题、观点或知识点，并将其转化为适合社交媒体传播的内容形式。`
			: `请生成 ${count} 个优质内容选题。选题要求：
1. 适合社交媒体的内容形式和传播特点
2. 具有话题性和传播潜力
3. 标题要有吸引力，能引发用户点击`
		}
${direction ? `\n## 创作方向\n${direction}` : ""}
${referenceText ? `\n## 参考资料（核心素材）\n以下是用户提供的参考资料。${direction ? "请结合上方的创作方向，从参考资料中获取灵感。" : "请直接从资料中提取选题——聚焦其核心主题、观点洞察和知识要点，不要偏向品牌营销角度。"}\n${referenceText}` : ""}
${!referenceText && global.brandPosition ? `\n## 品牌背景（仅供语气参考）\n- 品牌定位：${global.brandPosition}` : ""}

## 输出格式
请严格按照以下 JSON 格式输出，不要有任何其他文字：
[
  { "title": "选题标题", "description": "内容描述（2-4 句话）" }
]

${getContentDescriptionFieldRules("zh")}`
}

export function buildTopicsWithDetailsPrompt(
	global: SelfMediaInitGlobalSettings,
	count: number,
	direction: string | undefined,
	referenceText: string | undefined,
	styleValues: string,
	locale: ContentLocale,
): string {
	return locale === "en"
		? `You are an expert social media content strategist who specializes in creating complete content plans.

## Account Context
- Account Name: ${global.author}
${global.targetAudience ? `- Target Audience: ${global.targetAudience}` : ""}

## Task
${referenceText && !direction
			? `Analyze the following reference material and derive ${count} content topics with full configuration. Topics should be directly inspired by the reference material's themes, viewpoints, or knowledge points.`
			: `Generate ${count} high-quality content topics with full configuration for each. Requirements:
1. Suitable for social media content format and distribution
2. Have viral potential and engagement appeal
3. Titles should be attention-grabbing
4. For each topic, provide content description, platform, style, visual preset, card count, and outline`
		}
${direction ? `\n## Creative Direction\n${direction}` : ""}
${referenceText ? `\n## Reference Material (Primary Source)\n${direction ? "Use it as inspiration combined with the direction above." : "Extract topic ideas directly from this material — focus on its core themes, insights, and knowledge points rather than brand marketing angles."}\n${referenceText}` : ""}
${!referenceText && global.brandPosition ? `\n## Brand Context (for tone reference only)\n- Brand Positioning: ${global.brandPosition}` : ""}

## Output Format
Output strictly in the following JSON array format with no other text:
[
  {
    "title": "Topic title",
    "description": "Content description (2-4 sentences: core viewpoint, reader value, content angle)",
    "platform": "rednote",
    "style": one of [${styleValues}],
    "visualPreset": one of ["neo-brutalism", "code-dispatch", "dark-tech", "gradient-editorial", "personal-insight", "product-launch-preset", "ins-modern", "none"],
    "cardCount": 6-9,
    "outline": "- Point 1\\n  - Sub-point\\n- Point 2"
  }
]

Platform options: "rednote", "instagram", "wechat-official-accounts". Choose the most suitable for each topic.
${getCardOutlinePromptRules("en")}
${getWechatOutlinePromptRules("en")}

WeChat outline example:
${getWechatOutlineExample("en")}

${getContentDescriptionFieldRules("en")}`
		: `你是一位资深自媒体内容策划专家，擅长从素材中提炼完整的内容方案。

## 账号信息
- 账号名称：${global.author}
${global.targetAudience ? `- 目标受众：${global.targetAudience}` : ""}

## 任务
${referenceText && !direction
			? `请仔细分析以下参考资料，从中提炼出 ${count} 个内容选题，并为每个选题规划完整的内容配置。选题应直接来源于参考资料中的主题、观点或知识点。`
			: `请生成 ${count} 个优质内容选题，并为每个选题规划完整的内容配置。要求：
1. 适合社交媒体的内容形式和传播特点
2. 具有话题性和传播潜力
3. 标题要有吸引力
4. 为每个选题提供内容描述、平台、风格、视觉模板、卡片数、大纲`
		}
${direction ? `\n## 创作方向\n${direction}` : ""}
${referenceText ? `\n## 参考资料（核心素材）\n${direction ? "请结合上方的创作方向，从参考资料中获取灵感。" : "请直接从资料中提取选题——聚焦其核心主题、观点洞察和知识要点，不要偏向品牌营销角度。"}\n${referenceText}` : ""}
${!referenceText && global.brandPosition ? `\n## 品牌背景（仅供语气参考）\n- 品牌定位：${global.brandPosition}` : ""}

## 输出格式
请严格按照以下 JSON 数组格式输出，不要有任何其他文字：
[
  {
    "title": "选题标题",
    "description": "内容描述（2-4 句话：核心观点、读者价值、内容角度）",
    "platform": "rednote",
    "style": 从 [${styleValues}] 中选择,
    "visualPreset": 从 ["neo-brutalism", "code-dispatch", "dark-tech", "gradient-editorial", "personal-insight", "product-launch-preset", "ins-modern", "none"] 中选择,
    "cardCount": 6-9之间的数字,
    "outline": "- 要点1\\n  - 子要点\\n- 要点2"
  }
]

平台选项："rednote"（小红书）、"instagram"、"wechat-official-accounts"（微信公众号）。请为每个选题选择最合适的平台。
${getCardOutlinePromptRules("zh")}
${getWechatOutlinePromptRules("zh")}

微信公众号大纲示例：
${getWechatOutlineExample("zh")}

${getContentDescriptionFieldRules("zh")}`
}

function buildOutlinePromptBody(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	platform: string,
	style: string,
	locale: ContentLocale,
	isWechat: boolean,
	extraSections: string,
): string {
	const cardLine =
		article.cardCount > 0
			? locale === "en"
				? `- Card count: ${article.cardCount} (each card maps to one key point in the outline)`
				: `- 卡片数：${article.cardCount} 张（每张卡片对应大纲中的一个核心要点）`
			: ""

	return locale === "en"
		? `You are a professional content structure planner. Generate a clear content outline for the following article.

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
- Platform: ${platform}

## Article Information
- Title: ${article.title}
- Style: ${style}
${cardLine}
${article.description ? `- Content description: ${article.description}` : ""}
${article.notes ? `- Additional notes: ${article.notes}` : ""}
${extraSections}

## Requirements
1. Outline should be logically clear with proper hierarchy
2. Suitable for ${platform} content format
3. Include main points and sub-points
4. Use concise language
${getOutlineExtraRequirements("en", isWechat, article.cardCount)}

## Output Format
Use indented list format with "- " markers, child levels indented by two spaces:
${getOutlineFormatExample("en", isWechat)}`
		: `你是一位专业的内容结构规划师。请为以下文章生成清晰的内容大纲。

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
- 平台：${platform}

## 文章信息
- 标题：${article.title}
- 风格：${style}
${cardLine}
${article.description ? `- 内容描述：${article.description}` : ""}
${article.notes ? `- 补充说明：${article.notes}` : ""}
${extraSections}

## 要求
1. 大纲需要逻辑清晰、层次分明
2. 适合${platform}平台的内容展示形式
3. 包含主要观点和子要点
4. 使用简洁精炼的语言
${getOutlineExtraRequirements("zh", isWechat, article.cardCount)}

## 输出格式
请使用层级缩进的列表格式输出大纲，使用 "- " 作为列表标记，子层级用两个空格缩进：
${getOutlineFormatExample("zh", isWechat)}`
}

export function buildOutlinePrompt(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	locale: ContentLocale,
): string {
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (locale === "en" ? "general" : "通用")
	const isWechat = isWechatOfficialAccount(article.platform)
	return buildOutlinePromptBody(global, article, platform, style, locale, isWechat, "")
}

export function getOutlineSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional content structure planner. Output the outline list directly with no extra text."
		: "你是一个专业的内容结构规划师。请直接输出大纲列表，不要有多余的开头和结尾。"
}

export function buildOptimizeOutlinePrompt(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	instruction: string,
	locale: ContentLocale,
): string {
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (locale === "en" ? "general" : "通用")
	const isWechat = isWechatOfficialAccount(article.platform)
	const currentOutline = serializeOutlineToText(article.outline)
	const userInstruction =
		instruction.trim() ||
		(locale === "en"
			? "Optimize and improve the outline while preserving the core intent."
			: "在保留核心意图的前提下优化和完善大纲。")

	const extra =
		locale === "en"
			? `
## Current Outline
${currentOutline}

## User Instructions
${userInstruction}`
			: `
## 当前大纲
${currentOutline}

## 用户修改要求
${userInstruction}`

	return buildOutlinePromptBody(global, article, platform, style, locale, isWechat, extra)
}

export function getOptimizeOutlineSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional content structure planner. Output the revised outline list directly with no extra text."
		: "你是一个专业的内容结构规划师。请直接输出修改后的大纲列表，不要有多余的开头和结尾。"
}

export function buildCardContentPrompt(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	cardCount: number,
	locale: ContentLocale,
): string {
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (locale === "en" ? "general" : "通用")

	return locale === "en"
		? `You are a professional social media content planner specializing in card-based visual content for ${platform}.

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
${global.targetAudience ? `- Target Audience: ${global.targetAudience}` : ""}

## Article Information
- Title: ${article.title}
- Style: ${style}
- Number of cards: ${cardCount}
${article.description ? `- Description: ${article.description}` : ""}
${article.notes ? `- Additional notes: ${article.notes}` : ""}

## Task
Plan the content for each of the ${cardCount} cards. Each card should have a clear, specific content description explaining what should appear on that card (text, visuals, layout suggestions).

## Requirements
1. First card should be an eye-catching cover/hook
2. Content should flow logically from card to card
3. Each card should be independently readable but connected to the narrative
4. Last card should include a call-to-action or summary
5. Suitable for ${platform} content format and user behavior
6. Descriptions should be actionable and specific

## Output Format
Output exactly ${cardCount} lines, one per card. Each line starts with "- " followed by the card content description:
- Card 1 content description
- Card 2 content description
...`
		: `你是一位专业的社交媒体内容策划师，擅长为${platform}平台规划卡片式图文内容。

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
${global.targetAudience ? `- 目标受众：${global.targetAudience}` : ""}

## 文章信息
- 标题：${article.title}
- 风格：${style}
- 卡片数量：${cardCount} 张
${article.description ? `- 内容描述：${article.description}` : ""}
${article.notes ? `- 补充说明：${article.notes}` : ""}

## 任务
为这 ${cardCount} 张卡片规划每张的具体内容。每张卡片需要有明确的内容描述，说明该卡片应该呈现什么（文字内容、视觉元素、排版建议等）。

## 要求
1. 第一张卡片应该是吸引眼球的封面/钩子
2. 卡片之间的内容要有逻辑递进关系
3. 每张卡片独立可读，但又串联成完整叙事
4. 最后一张卡片包含行动号召或总结
5. 适合${platform}平台的浏览习惯和内容形式
6. 内容描述要具体、可执行

## 输出格式
请输出恰好 ${cardCount} 行，每行以 "- " 开头，描述对应卡片的内容：
- 第 1 张卡片内容描述
- 第 2 张卡片内容描述
...`
}

export function getCardContentSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional social media card content planner. Output the card list directly with no extra text."
		: "你是一个专业的社交媒体卡片内容规划师。请直接输出卡片内容列表，不要有多余的开头和结尾。"
}

export function buildOptimizeCardContentPrompt(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	cardCount: number,
	instruction: string,
	locale: ContentLocale,
): string {
	const platform = getPlatformLabel(article.platform)
	const style = getStyleLabel(article.style) || (locale === "en" ? "general" : "通用")
	const currentContent = article.outline
		.map((node, i) => `- 第 ${i + 1} 张：${node.text}`)
		.join("\n")
	const userInstruction =
		instruction.trim() ||
		(locale === "en"
			? "Optimize the card content while preserving the core intent."
			: "在保留核心意图的前提下优化卡片内容。")

	return locale === "en"
		? `You are a professional social media content planner. Modify the following card content plan according to the user's instructions.

## Current Card Content
${currentContent}

## User Instructions
${userInstruction}

## Brand Information
- Account: ${global.author}
- Positioning: ${global.brandPosition}
- Platform: ${platform}

## Article Information
- Title: ${article.title}
- Style: ${style}
- Number of cards: ${cardCount}
${article.notes ? `- Additional notes: ${article.notes}` : ""}

## Requirements
1. Apply the user's modification requests precisely
2. Maintain logical flow between cards
3. Keep the same number of cards (${cardCount})
4. Suitable for ${platform} content format

## Output Format
Output exactly ${cardCount} lines, one per card, starting with "- ":
- Card 1 content
- Card 2 content
...`
		: `你是一位专业的社交媒体内容策划师。请根据用户的修改意愿，调整以下卡片内容规划。

## 当前卡片内容
${currentContent}

## 用户修改要求
${userInstruction}

## 品牌信息
- 账号：${global.author}
- 定位：${global.brandPosition}
- 平台：${platform}

## 文章信息
- 标题：${article.title}
- 风格：${style}
- 卡片数量：${cardCount}
${article.notes ? `- 补充说明：${article.notes}` : ""}

## 要求
1. 严格按照用户的修改意愿调整内容
2. 保持卡片之间的逻辑连贯性
3. 保持卡片数量不变（${cardCount} 张）
4. 适合${platform}平台的内容展示形式

## 输出格式
请输出恰好 ${cardCount} 行，每行以 "- " 开头：
- 第 1 张卡片内容
- 第 2 张卡片内容
...`
}

export function getOptimizeCardContentSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional social media card content planner. Output the revised card list directly with no extra text."
		: "你是一个专业的社交媒体卡片内容规划师。请直接输出修改后的卡片内容列表，不要有多余的开头和结尾。"
}

export function buildStreamTopicsPrompt(
	global: SelfMediaInitGlobalSettings,
	count: number,
	direction: string | undefined,
	locale: ContentLocale,
): string {
	return locale === "en"
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
}

export function buildStreamOutlinePrompt(article: ArticleDetail, locale: ContentLocale): string {
	const style = getStyleLabel(article.style) || (locale === "en" ? "general" : "通用")
	const platform = getPlatformLabel(article.platform)
	const isWechat = isWechatOfficialAccount(article.platform)

	return locale === "en"
		? `Generate a content outline for article "${article.title}" (${style} style, ${platform} platform). Use "- " list format, child levels indented by two spaces.${isWechat ? ` This is a WeChat long-form article — use multi-level hierarchy with 4-6 major sections, each with 2-4 sub-points.` : ""} Output outline directly.`
		: `为文章「${article.title}」(${style}风格，${platform}平台) 生成内容大纲。使用 "- " 列表格式，子层级两个空格缩进。${isWechat ? "这是微信公众号长文，请生成多级大纲：4-6 个正文大段，每段含 2-4 个子要点。" : ""}直接输出大纲。`
}

export function buildArticleDetailsPrompt(
	global: SelfMediaInitGlobalSettings,
	article: ArticleDetail,
	platform: string,
	styleValues: string,
	isCardPlatform: boolean,
	locale: ContentLocale,
): string {
	const cardRules = isCardPlatform
		? getCardOutlinePromptRules(locale)
		: `${getWechatOutlinePromptRules(locale)}

${locale === "en" ? "Outline example:" : "大纲示例："}
${getWechatOutlineExample(locale)}`

	return locale === "en"
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
2. **visualPreset**: Choose from ["neo-brutalism", "code-dispatch", "dark-tech", "gradient-editorial", "personal-insight", "product-launch-preset", "ins-modern", "none"] (considering platform: ${article.platform})
${isCardPlatform ? `3. **cardCount**: Recommended card count (integer between 6-9)` : ""}
4. **outline**: Generate structured outline (use "- " list format, child levels indented by two spaces)
5. **notes**: Additional creative notes (one sentence)

${cardRules}

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
2. **visualPreset**：从 ["neo-brutalism", "code-dispatch", "dark-tech", "gradient-editorial", "personal-insight", "product-launch-preset", "ins-modern", "none"] 中选择最合适的视觉模板（考虑平台：${article.platform}）
${isCardPlatform ? `3. **cardCount**：推荐卡片数量（6-9 之间的整数）` : ""}
4. **outline**：生成结构化大纲（使用 "- " 列表格式，子层级两个空格缩进）
5. **notes**：补充创作注意事项（一句话）

${cardRules}

## 输出格式
请严格按以下 JSON 输出，不要有其他文字：
{
  "style": "选择的风格值（英文标识符）",
  "visualPreset": "选择的视觉模板值（英文标识符）",
  ${isCardPlatform ? `"cardCount": 数字,` : ""}
  "outline": "大纲文本（使用换行和缩进）",
  "notes": "补充说明"
}`
}

export function getArticleDetailsSystemPrompt(locale: ContentLocale): string {
	return locale === "en"
		? "You are a professional social media content planning assistant. Output strictly in JSON format."
		: "你是一个专业的自媒体内容策划助手。请严格按照 JSON 格式输出。"
}

export function buildPolishTextPrompt(text: string, context: string | undefined): string {
	return `你是一位专业的文案编辑，擅长将口语化、随意的描述润色为清晰、专业的文字。

## 原始输入
${text}
${context ? `\n## 上下文\n${context}` : ""}

## 要求
1. 保留原文的核心意图和关键信息
2. 改善表达、消除口语化和冗余
3. 让文字更加精炼、结构化
4. 不要改变原意，不要添加没提到的内容
5. 直接输出润色后的文字，不要有任何前缀说明`
}

export function getStylePresetValues(): string {
	return STYLE_PRESETS.filter((s) => s.value !== "custom")
		.map((s) => `"${s.value}"`)
		.join(", ")
}
