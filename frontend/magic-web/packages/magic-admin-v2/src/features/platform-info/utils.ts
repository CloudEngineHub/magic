import { validateMultiplierSettings } from "../../../../model-billing-reference"
import { z } from "zod"
import type {
	PlatformInfoFormState,
	PlatformLocale,
	PlatformWatermarkDepth,
	PlatformWatermarkField,
} from "@magic-admin-v2/features/platform-info/types"
import { Language } from "@magic-admin-v2/i18n/resources"
import type { ApiError } from "@magic-admin-v2/api/types"

export const platformLocales: PlatformLocale[] = [Language.ZhCN, Language.EnUS]
export const GLOBAL_SYSTEM_PROMPT_MAX_LENGTH = 5000

/**
 * 水印可选内容与展示顺序。这个 `as const` 元组同时作为类型约束、zod 枚举
 * 和界面渲染顺序的唯一来源，避免多处维护同一份字段清单。
 */
export const platformWatermarkFields = [
	"real_name",
	"employee_no",
	"visit_time",
	"department",
	"phone",
	"email",
] as const satisfies readonly PlatformWatermarkField[]

/** 水印深浅档位顺序，与后端 `watermark.depth` 一致。 */
export const platformWatermarkDepths = [
	"light",
	"standard",
	"strong",
] as const satisfies readonly PlatformWatermarkDepth[]

/**
 * 预览层文字色需要与前台水印渲染保持一致，属于渲染参数而不是语义色，
 * 因此不能替换成主题 token。
 */
export const platformWatermarkDepthTextColors: Record<PlatformWatermarkDepth, string> = {
	light: "rgba(0, 0, 0, 0.03)",
	standard: "rgba(0, 0, 0, 0.045)",
	strong: "rgba(0, 0, 0, 0.06)",
}

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
	| "modelMultiplier"

export const platformInfoSectionTitleKeys: Record<PlatformInfoSectionId, string> = {
	basic: "platformInfo.section.basic",
	seo: "platformInfo.section.seo",
	agentPrompt: "platformInfo.section.agentPrompt",
	globalSystemPrompt: "platformInfo.section.globalSystemPrompt",
	footer: "platformInfo.section.footer",
	watermark: "platformInfo.section.watermark",
	modelMultiplier: "platformInfo.section.modelMultiplier",
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
	modelMultiplier: "platformInfo.sectionDesc.modelMultiplier",
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

/**
 * 按固定顺序把已选水印内容拼成预览文案。
 * 未选择任何内容时返回空串，由调用方决定兜底文案。
 */
export function buildPlatformWatermarkPreviewText(
	fields: readonly PlatformWatermarkField[],
	samples: Record<PlatformWatermarkField, string>,
) {
	return fields
		.map((field) => samples[field].trim())
		.filter(Boolean)
		.join(" · ")
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
	// 草稿只作预览和输入校验，金额计算与默认值仍以后端保存结果为准。
	const modelMultiplierShape = {
		model_billing_multiplier: z
			.object({
				enabled: z.boolean(),
				base_price_cny: z.string().nullable(),
				input_price: z.string().nullable().optional(),
				input_price_cny: z.string().nullable().optional(),
				output_price: z.string().nullable().optional(),
				currency: z
					.enum(["CNY", "USD"], { error: t("platformInfo.multiplier.invalidCurrency") })
					.nullable()
					.optional(),
				output_price_cny: z.string().nullable().optional(),
				usd_to_cny_rate: z.string().nullable(),
			})
			.superRefine((value, context) => {
				for (const field of validateMultiplierSettings(value)) {
					context.addIssue({
						code: "custom",
						path: [field],
						message: t(
							field === "currency"
								? "platformInfo.multiplier.invalidCurrency"
								: field === "usd_to_cny_rate"
									? "platformInfo.multiplier.invalidAmount"
									: "platformInfo.multiplier.invalidPrices",
						),
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
		modelMultiplier: z.object(modelMultiplierShape),
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
		...modelMultiplierShape,
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
