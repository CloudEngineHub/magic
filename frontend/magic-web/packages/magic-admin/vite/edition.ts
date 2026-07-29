export const EDITION = {
	opensource: "opensource",
	enterprise: "enterprise",
} as const
/**
 * 单一 edition 开关：优先 EDITION（skill 约定），兼容历史 BUILD_EDITION。
 */
export function getEdition() {
	if (process.env.EDITION === EDITION.enterprise) return EDITION.enterprise
	return EDITION.opensource
}

export function isEnterpriseEdition(): boolean {
	return getEdition() === EDITION.enterprise
}
