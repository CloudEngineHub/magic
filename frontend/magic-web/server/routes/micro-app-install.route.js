const getMicroAppProjectName = require("../apis/getMicroAppProjectName")
const getPublishedMicroApp = require("../apis/getPublishedMicroApp")
const {
	consumeIconRateLimit,
	getCachedInstallIcon,
	getIconClientKey,
	readInstallIconUrl,
	resetInstallIconCache,
	resolveInstallIconBody,
} = require("../utils/installIconCache")

const SUPPORTED_ICON_SIZES = new Set(["180", "192", "512"])

function readPublishedName(response) {
	const data = response?.data?.data || response?.data || response || {}
	return typeof data.project_name === "string" ? data.project_name.trim() : ""
}

function setNoStoreHeaders(res) {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
	res.setHeader("Pragma", "no-cache")
	res.setHeader("X-Content-Type-Options", "nosniff")
}

function setIconCacheHeaders(res, etag) {
	res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60")
	res.setHeader("ETag", etag)
	res.setHeader("X-Content-Type-Options", "nosniff")
}

function setRetryableEmptyHeaders(res) {
	res.setHeader("Cache-Control", "public, max-age=10")
	res.setHeader("Retry-After", "60")
	res.setHeader("X-Content-Type-Options", "nosniff")
}

function respondWithInstallError(error, res, next) {
	const statusCode = Number(error?.statusCode)
	if (statusCode === 429 || statusCode === 503) {
		setRetryableEmptyHeaders(res)
		return res.status(statusCode).send("")
	}
	if (statusCode >= 400 && statusCode < 500) return res.status(statusCode).send("")
	return next(error)
}

function buildManifest(appId, appName) {
	const encodedAppId = encodeURIComponent(appId)
	const iconUrl = `/micro-app/${encodedAppId}/icon`

	// Always advertise icons; /icon falls back to platform favicon then a default SVG.
	return {
		id: `/micro-app/${encodedAppId}`,
		name: appName || "Micro App",
		short_name: appName || "Micro App",
		start_url: `/micro-app/${encodedAppId}?source=pwa`,
		scope: "/micro-app/",
		display: "standalone",
		theme_color: "#ffffff",
		background_color: "#ffffff",
		icons: [
			{ src: `${iconUrl}?size=192`, sizes: "192x192", type: "image/svg+xml" },
			{ src: `${iconUrl}?size=512`, sizes: "512x512", type: "image/svg+xml" },
		],
	}
}

class MicroAppInstallRoutes {
	async manifest(req, res, next) {
		setNoStoreHeaders(res)
		try {
			const appId = String(req.params.appId || "").trim()
			const [, projectNameResponse] = await Promise.all([
				getPublishedMicroApp(appId),
				getMicroAppProjectName(appId).catch(() => null),
			])
			const appName = readPublishedName(projectNameResponse)

			res.setHeader("Content-Type", "application/manifest+json; charset=utf-8")
			return res.json(buildManifest(appId, appName))
		} catch (error) {
			return respondWithInstallError(error, res, next)
		}
	}

	async icon(req, res, next) {
		try {
			const size = String(req.query.size || "512")
			if (!SUPPORTED_ICON_SIZES.has(size))
				return res.status(400).json({ message: "Unsupported icon size" })

			if (!consumeIconRateLimit(getIconClientKey(req))) {
				setRetryableEmptyHeaders(res)
				return res.status(429).send("")
			}

			const installIcon = await getCachedInstallIcon(String(req.params.appId || "").trim())
			if (installIcon) {
				setIconCacheHeaders(res, installIcon.etag)
				if (req.headers?.["if-none-match"] === installIcon.etag)
					return res.status(304).send("")
				res.setHeader("Content-Type", installIcon.contentType)
				return res.send(installIcon.body)
			}

			res.setHeader("Cache-Control", "public, max-age=10")
			res.setHeader("X-Content-Type-Options", "nosniff")
			return res.status(404).send("")
		} catch (error) {
			return respondWithInstallError(error, res, next)
		}
	}
}

module.exports = MicroAppInstallRoutes
module.exports.buildManifest = buildManifest
module.exports.readInstallIconUrl = readInstallIconUrl
module.exports.resolveInstallIconBody = resolveInstallIconBody
module.exports.resetInstallIconCache = resetInstallIconCache
