const getMicroAppProjectName = require("../apis/getMicroAppProjectName")
const getGlobalPlatformInfo = require("../apis/getGlobalPlatformInfo")
const getPublishedMicroApp = require("../apis/getPublishedMicroApp")
const downloadInstallIcon = require("../utils/downloadInstallIcon")

const SUPPORTED_ICON_SIZES = new Set(["180", "192", "512"])

function readPublishedName(response) {
	const data = response?.data?.data || response?.data || response || {}
	return typeof data.project_name === "string" ? data.project_name.trim() : ""
}

function readInstallIconUrl(publishedMicroApp) {
	const rawUrl = publishedMicroApp?.icon_url
	return typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : ""
}

function readPlatformFaviconUrl(platformInfo) {
	const favicon = platformInfo?.favicon
	return typeof favicon === "string" && favicon.trim() ? favicon.trim() : ""
}

function setNoStoreHeaders(res) {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
	res.setHeader("Pragma", "no-cache")
	res.setHeader("X-Content-Type-Options", "nosniff")
}

function respondWithInstallError(error, res, next) {
	const statusCode = Number(error?.statusCode)
	if (statusCode >= 400 && statusCode < 500) return res.status(statusCode).send("")
	return next(error)
}

function buildManifest(appId, appName) {
	const encodedAppId = encodeURIComponent(appId)
	const iconUrl = `/micro-app/${encodedAppId}/icon`

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
			{ src: `${iconUrl}?size=192`, sizes: "192x192" },
			{ src: `${iconUrl}?size=512`, sizes: "512x512" },
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
		setNoStoreHeaders(res)
		try {
			const size = String(req.query.size || "512")
			if (!SUPPORTED_ICON_SIZES.has(size)) {
				return res.status(400).json({ message: "Unsupported icon size" })
			}

			const publishedMicroApp = await getPublishedMicroApp(req.params.appId)
			const iconUrl = readInstallIconUrl(publishedMicroApp)

			if (iconUrl) {
				const icon = await downloadInstallIcon(iconUrl).catch(() => null)
				if (icon) {
					res.setHeader("Content-Type", icon.contentType)
					return res.send(icon.body)
				}
			}

			const platformFaviconUrl = await getGlobalPlatformInfo()
				.then(readPlatformFaviconUrl)
				.catch(() => "")
			if (platformFaviconUrl) {
				const platformIcon = await downloadInstallIcon(platformFaviconUrl).catch(() => null)
				if (platformIcon) {
					res.setHeader("Content-Type", platformIcon.contentType)
					return res.send(platformIcon.body)
				}
			}

			return res.status(404).send("")
		} catch (error) {
			return respondWithInstallError(error, res, next)
		}
	}
}

module.exports = MicroAppInstallRoutes
module.exports.buildManifest = buildManifest
module.exports.readInstallIconUrl = readInstallIconUrl
