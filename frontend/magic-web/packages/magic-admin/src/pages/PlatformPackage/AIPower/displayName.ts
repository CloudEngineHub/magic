const SUPER_MAGIC_BRAND_PATTERN = /超级麦吉|super\s+magic/gi

/**
 * Remove product branding from AI capability text shown in the admin.
 * The capability API can return names/descriptions that still contain the
 * open-source product name, which should not be exposed in private deployments.
 */
export function stripSuperMagicBrand(value?: string | null): string {
	if (!value) return ""

	return value
		.replace(SUPER_MAGIC_BRAND_PATTERN, "")
		.replace(/[（(]\s*[）)]/g, "")
		.replace(/^\s*[-—_:：|·]\s*|\s*[-—_:：|·]\s*$/g, "")
		.replace(/\s{2,}/g, " ")
		.trim()
}
