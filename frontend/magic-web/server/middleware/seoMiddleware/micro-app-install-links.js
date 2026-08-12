function buildInstallLinks(routeOptions, appId) {
	if (!routeOptions.installable || !appId) return {}

	const encodedAppId = encodeURIComponent(appId)
	const iconUrl = `/micro-app/${encodedAppId}/icon`
	return {
		manifestUrl: `/micro-app/${encodedAppId}/manifest.webmanifest`,
		appleTouchIconUrl: `${iconUrl}?size=180`,
		// Reuse install icon route: app icon.svg first, platform favicon fallback.
		faviconUrl: `${iconUrl}?size=192`,
	}
}

module.exports = buildInstallLinks
