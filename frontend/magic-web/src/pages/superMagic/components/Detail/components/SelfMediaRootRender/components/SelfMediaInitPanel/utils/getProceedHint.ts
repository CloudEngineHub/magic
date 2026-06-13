import type { ArticleDetail } from "../types"

interface GetProceedHintOptions {
	t: (key: string) => string
	currentStep: number
	brandImagesUploading: boolean
	hasPendingBrandImageUploads: boolean
	articles: ArticleDetail[]
}

export function getProceedHint({
	t,
	currentStep,
	brandImagesUploading,
	hasPendingBrandImageUploads,
	articles,
}: GetProceedHintOptions): string {
	switch (currentStep) {
		case 0:
			if (brandImagesUploading || hasPendingBrandImageUploads) {
				return t("detail.selfMedia.initPanel.nav.hints.brandUploading")
			}
			return t("detail.selfMedia.initPanel.nav.hints.brandReady")
		case 1:
			if (articles.length === 0) {
				return t("detail.selfMedia.initPanel.nav.hints.noArticle")
			}
			if (articles.some((article) => !article.title.trim())) {
				return t("detail.selfMedia.initPanel.nav.hints.missingTitle")
			}
			if (articles.some((article) => !article.platform)) {
				return t("detail.selfMedia.initPanel.nav.hints.missingPlatform")
			}
			return t("detail.selfMedia.initPanel.nav.hints.articleReady")
		default:
			return ""
	}
}
