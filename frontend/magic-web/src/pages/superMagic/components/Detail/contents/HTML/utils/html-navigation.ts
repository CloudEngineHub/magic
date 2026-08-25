import { slugify } from "@/utils/slug"

export interface HtmlNavigationRequest {
	/** Path used for attachment matching. It never contains query or hash. */
	filePath: string
	/** Complete query string, including the leading `?` when present. */
	search: string
	/** Complete hash string, including the leading `#` when present. */
	hash: string
	/** Normalized anchor used by the existing scroll implementation. */
	anchor: string
}

/**
 * Returns a stable identity for the runtime navigation state.
 *
 * The identity is used by the HTML renderer to distinguish a new document
 * navigation from an ordinary content update.
 */
export function getHtmlNavigationKey(navigation?: HtmlNavigationRequest): string {
	if (!navigation) return ""

	return [navigation.filePath, navigation.search, navigation.hash, navigation.anchor].join(
		"\u0000",
	)
}

function normalizeAnchor(hash: string): string {
	if (!hash) return ""

	const rawAnchor = hash.slice(1)
	let decodedAnchor = rawAnchor
	try {
		decodedAnchor = decodeURIComponent(rawAnchor)
	} catch {
		// Keep the original value when the hash contains malformed encoding.
	}

	return slugify(decodedAnchor)
}

function splitNavigationParts(value: string): HtmlNavigationRequest {
	const hashIndex = value.indexOf("#")
	const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex)
	const hash = hashIndex === -1 ? "" : value.slice(hashIndex)
	const searchIndex = withoutHash.indexOf("?")

	return {
		filePath: searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex),
		search: searchIndex === -1 ? "" : withoutHash.slice(searchIndex),
		hash,
		anchor: normalizeAnchor(hash),
	}
}

/**
 * Parses navigation URLs used by HTML previews without changing Markdown link semantics.
 * Relative paths remain relative so the caller can resolve them against the current file
 * directory. Same-origin absolute URLs are converted to their pathname plus query/hash.
 */
export function parseHtmlNavigationRequest(
	href: string,
	baseHref?: string,
): HtmlNavigationRequest | null {
	if (typeof href !== "string") return null

	const value = href.trim()
	if (!value) return null
	if (value.startsWith("#") || value.startsWith("?")) return splitNavigationParts(value)

	if (/^(mailto:|tel:|javascript:|data:|blob:|about:|\/\/)/i.test(value)) {
		return null
	}

	if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
		if (!baseHref) return null

		try {
			const targetUrl = new URL(value)
			const baseUrl = new URL(baseHref)
			if (targetUrl.origin !== baseUrl.origin) return null
			return splitNavigationParts(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`)
		} catch {
			return null
		}
	}

	return splitNavigationParts(value)
}
