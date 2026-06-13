import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"

function generateSlug(title: string): string {
	const ascii = title.replace(/[^a-zA-Z0-9\s-]/g, "").trim()
	if (ascii.length > 3) return ascii.toLowerCase().replace(/\s+/g, "-").slice(0, 40)
	return "post"
}

export function buildDefaultArticleFolderName(title: string, index: number): string {
	return `${String(index + 1).padStart(2, "0")}-${generateSlug(title)}`
}

export function resolveArticleFolderName(article: ArticleDetail, index: number): string {
	if (article.folderName.trim()) return article.folderName.trim()
	return buildDefaultArticleFolderName(article.title, index)
}
