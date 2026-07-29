import type { CanvasDesignPlugin } from "../../../../runtime/document/types"

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])
const TRUSTED_OBJECT_STORAGE_HOST_PATTERNS = [/^[^.]+\.tos-[^.]+\.volces\.com$/i]

/* Validates a URL for fetching plugin blobs, ensuring it adheres to allowed protocols,
   does not contain credentials, and is hosted on permitted origins or trusted object storage. */
export function validatePluginFetchBlobUrl(
	plugin: Pick<CanvasDesignPlugin, "name" | "runtimeUrl" | "resourceBaseUrl">,
	url: string,
	currentOrigin: string,
): URL {
	const parsedUrl = new URL(url, currentOrigin)

	if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
		throw new Error("Plugin fetchBlob URL protocol is not allowed.")
	}
	if (parsedUrl.username || parsedUrl.password) {
		throw new Error("Plugin fetchBlob URL credentials are not allowed.")
	}
	if (isForbiddenHost(parsedUrl.hostname)) {
		throw new Error("Plugin fetchBlob URL host is not allowed.")
	}

	const allowedOrigins = new Set<string>([currentOrigin])
	for (const candidate of [plugin.runtimeUrl, plugin.resourceBaseUrl]) {
		if (!candidate) continue
		try {
			allowedOrigins.add(new URL(candidate, currentOrigin).origin)
		} catch {
			// Ignore malformed plugin metadata and fall back to the safe origin set.
		}
	}
	if (isTrustedObjectStorageHost(parsedUrl.hostname)) {
		return parsedUrl
	}

	if (!allowedOrigins.has(parsedUrl.origin)) {
		throw new Error("Plugin fetchBlob URL origin is not allowed.")
	}

	return parsedUrl
}

function isForbiddenHost(hostname: string): boolean {
	const normalizedHost = hostname.trim().toLowerCase()
	if (!normalizedHost) return true
	if (normalizedHost === "localhost" || normalizedHost.endsWith(".localhost")) return true
	if (normalizedHost === "0.0.0.0" || normalizedHost === "127.0.0.1") return true
	if (normalizedHost === "::1" || normalizedHost === "[::1]") return true
	if (isPrivateIpv4(normalizedHost)) return true
	return false
}

function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split(".")
	if (parts.length !== 4) return false
	const octets = parts.map((part) => Number(part))
	if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
		return false
	}

	const [first, second] = octets
	if (first === 10) return true
	if (first === 127) return true
	if (first === 169 && second === 254) return true
	if (first === 172 && second >= 16 && second <= 31) return true
	if (first === 192 && second === 168) return true
	return false
}

function isTrustedObjectStorageHost(hostname: string): boolean {
	const normalizedHost = hostname.trim().toLowerCase()
	if (!normalizedHost) return false
	return TRUSTED_OBJECT_STORAGE_HOST_PATTERNS.some((pattern) => pattern.test(normalizedHost))
}
