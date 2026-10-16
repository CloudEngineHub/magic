import { z } from "zod"
import {
	buildIdentityWatermarkPreviewText,
	identityWatermarkDepthTextColors,
	identityWatermarkDepths,
	identityWatermarkFields,
} from "@magic-admin-v2/components/identity-watermark/watermark-utils"
import type {
	PlatformInfoFormState,
	PlatformLocale,
} from "@magic-admin-v2/features/platform-info/types"
import { Language } from "@magic-admin-v2/i18n/resources"
import type { ApiError } from "@magic-admin-v2/api/types"

export const platformLocales: PlatformLocale[] = [Language.ZhCN, Language.EnUS]
export const GLOBAL_SYSTEM_PROMPT_MAX_LENGTH = 5000

/**
 * 水印字段顺序、深浅档位、预览文字色和预览文案构造都来自跨 feature 的
 * 身份水印共享模块（企业水印也在用）。这里保留平台侧的历史命名，
 * 避免大范围重命名；语义与取值以共享模块为准。
 */
export const platformWatermarkFields = identityWatermarkFields
export const platformWatermarkDepths = identityWatermarkDepths
export const platformWatermarkDepthTextColors = identityWatermarkDepthTextColors
export const buildPlatformWatermarkPreviewText = buildIdentityWatermarkPreviewText

export const formSetValueOptions = {
	shouldDirty: true,
	shouldTouch: true,
	shouldValidate: true,
} as const

export const localeLabels: Record<PlatformLocale, string> = {
	zh_CN: "简体中文",
	en_US: "English",
}

export type LocaleCompletion = Record<PlatformLocale, boolean>
export type PlatformInfoSectionId =
	| "basic"
	| "seo"
	| "agentPrompt"
	| "globalSystemPrompt"
	| "footer"
	| "watermark"

export const platformInfoSectionTitleKeys: Record<PlatformInfoSectionId, string> = {
	basic: "platformInfo.section.basic",
	seo: "platformInfo.section.seo",
	agentPrompt: "platformInfo.section.agentPrompt",
	globalSystemPrompt: "platformInfo.section.globalSystemPrompt",
	footer: "platformInfo.section.footer",
	watermark: "platformInfo.section.watermark",
}

/** 只有按语言维护内容的 section 才展示内容语言切换条。 */
export function showsPlatformInfoContentLocale(section: PlatformInfoSectionId) {
	return section === "seo" || section === "agentPrompt" || section === "footer"
}

/**
 * 分区说明文案。预览态和编辑态共用，避免两处口径不一致；
 * 按语言维护内容的分区统一使用内容语言说明。
 */
export const platformInfoSectionDescriptionKeys: Record<PlatformInfoSectionId, string> = {
	basic: "nav.desc.platformInfo",
	seo: "platformInfo.contentLanguage.description",
	agentPrompt: "platformInfo.contentLanguage.description",
	globalSystemPrompt: "platformInfo.sectionDesc.globalSystemPrompt",
	footer: "platformInfo.contentLanguage.description",
	watermark: "platformInfo.sectionDesc.watermark",
}

export const sharedImageFields = [
	{
		key: "minimal_logo",
		labelKey: "platformInfo.field.minimalLogo",
		required: true,
	},
	{
		key: "favicon",
		labelKey: "platformInfo.field.favicon",
		required: true,
	},
] as const

function isFilled(value: string) {
	return value.trim().length > 0
}

function isContentLocaleComplete(value: PlatformInfoFormState, locale: PlatformLocale) {
	return [
		value.title_i18n[locale],
		value.keywords_i18n[locale],
		value.description_i18n[locale],
		value.agent_role_name_i18n[locale],
		value.agent_role_description_i18n[locale],
		value.footer.copyright_i18n[locale],
	].every(isFilled)
}

export function getContentLocaleCompletion(value: PlatformInfoFormState): LocaleCompletion {
	return {
		zh_CN: isContentLocaleComplete(value, Language.ZhCN),
		en_US: isContentLocaleComplete(value, Language.EnUS),
	}
}

export function createPlatformInfoSchema(
	t: (key: string) => string,
	section?: PlatformInfoSectionId,
) {
	const localizedRequiredText = (message: string) =>
		z.object({
			zh_CN: z.string().trim().min(1, message),
			en_US: z.string().trim().min(1, message),
		})
	const localizedText = z.object({
		zh_CN: z.string(),
		en_US: z.string(),
	})
	const footerSchema = z
		.object({
			copyright_i18n: localizedText,
			filing: z.object({
				enabled: z.boolean(),
				number: z.string(),
				link: z.string(),
			}),
		})
		.superRefine((value, context) => {
			if (value.filing.enabled && !value.filing.number.trim()) {
				context.addIssue({
					code: "custom",
					message: t("platformInfo.validation.filingNumberRequired"),
					path: ["filing", "number"],
				})
			}

			if (!isValidOptionalUrl(value.filing.link)) {
				context.addIssue({
					code: "custom",
					message: t("platformInfo.validation.filingLinkInvalid"),
					path: ["filing", "link"],
				})
			}
		})

	const basicShape = {
		logo: z.object({
			zh_CN: z.string().trim().min(1, t("platformInfo.validation.requiredImage")),
			en_US: z.string().trim().min(1, t("platformInfo.validation.requiredImage")),
		}),
		favicon: z.string().trim().min(1, t("platformInfo.validation.requiredImage")),
		minimal_logo: z.string().trim().min(1, t("platformInfo.validation.requiredImage")),
		default_language: z.enum([Language.ZhCN, Language.EnUS]),
		name_i18n: localizedRequiredText(t("platformInfo.validation.platformNameRequired")),
	}
	const seoShape = {
		title_i18n: localizedText,
		keywords_i18n: localizedText,
		description_i18n: localizedText,
	}
	const agentPromptShape = {
		agent_role_name_i18n: localizedRequiredText(
			t("platformInfo.validation.agentPromptRequired"),
		),
		agent_role_description_i18n: localizedRequiredText(
			t("platformInfo.validation.agentPromptRequired"),
		),
	}
	const globalSystemPromptShape = {
		global_system_prompt: z
			.string()
			.max(
				GLOBAL_SYSTEM_PROMPT_MAX_LENGTH,
				t("platformInfo.validation.globalSystemPromptTooLong"),
			),
	}
	const footerShape = { footer: footerSchema }
	const watermarkShape = {
		watermark: z
			.object({
				enabled: z.boolean(),
				fields: z.array(z.enum(platformWatermarkFields)),
				depth: z.enum(platformWatermarkDepths),
			})
			.superRefine((value, context) => {
				// 水印开启时必须有内容，否则前台会渲染出空白水印。
				if (value.enabled && value.fields.length === 0) {
					context.addIssue({
						code: "custom",
						message: t("platformInfo.validation.watermarkContentRequired"),
						path: ["fields"],
					})
				}
			}),
	}
	const sectionSchemas = {
		basic: z.object(basicShape),
		seo: z.object(seoShape),
		agentPrompt: z.object(agentPromptShape),
		globalSystemPrompt: z.object(globalSystemPromptShape),
		footer: z.object(footerShape),
		watermark: z.object(watermarkShape),
	}

	if (section) {
		// Keep the complete form values in the resolver result. This allows a user
		// to edit multiple tabs before saving without losing values from the other
		// tabs when the active tab changes.
		return sectionSchemas[section].passthrough()
	}

	return z.object({
		...basicShape,
		...seoShape,
		...agentPromptShape,
		...globalSystemPromptShape,
		...footerShape,
		...watermarkShape,
	})
}

export function toPlatformLocale(value: string): PlatformLocale {
	return value === Language.EnUS ? Language.EnUS : Language.ZhCN
}

export function getMutationErrorMessage(error: unknown, t: (key: string) => string) {
	if (typeof error === "object" && error && "message" in error) {
		const message = (error as ApiError).message

		if (typeof message === "string" && message.trim().length > 0) {
			return message
		}
	}

	return t("common.requestFailed")
}

export function isSafeImageUrl(value: string) {
	return /^https?:\/\//i.test(value)
}

function isValidOptionalUrl(value: string) {
	return value.trim().length === 0 || /^https?:\/\/.+/i.test(value)
}
