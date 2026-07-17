const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])
const TRUSTED_OBJECT_STORAGE_HOST_PATTERNS = [/^[^.]+\.tos-[^.]+\.volces\.com$/i]

interface ResolveTrustedTemplateColorUrlInput {
	allowedOrigins?: string[]
	currentOrigin: string
	imageUrl: string
}

function normalizeOrigin(origin: string, currentOrigin: string) {
	try {
		const parsedOrigin = new URL(origin, currentOrigin)
		if (!ALLOWED_PROTOCOLS.has(parsedOrigin.protocol)) return ""
		return parsedOrigin.origin
	} catch {
		return ""
	}
}

function isTrustedObjectStorageHost(hostname: string) {
	return TRUSTED_OBJECT_STORAGE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

export function resolveTrustedTemplateColorUrl({
	allowedOrigins = [],
	currentOrigin,
	imageUrl,
}: ResolveTrustedTemplateColorUrlInput) {
	try {
		const parsedUrl = new URL(imageUrl, currentOrigin)
		if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) return null
		if (parsedUrl.username || parsedUrl.password) return null

		const trustedOrigins = new Set(
			[currentOrigin, ...allowedOrigins]
				.map((origin) => normalizeOrigin(origin, currentOrigin))
				.filter(Boolean),
		)
		if (
			trustedOrigins.has(parsedUrl.origin) ||
			isTrustedObjectStorageHost(parsedUrl.hostname)
		) {
			return parsedUrl
		}
		return null
	} catch {
		return null
	}
}
