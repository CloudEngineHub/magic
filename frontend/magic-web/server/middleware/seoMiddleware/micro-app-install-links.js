function buildInstallLinks(routeOptions, appId) {
	if (!routeOptions.installable || !appId) return {}

	const encodedAppId = encodeURIComponent(appId)
	return {
		manifestUrl: `/micro-app/${encodedAppId}/manifest.webmanifest`,
		appleTouchIconUrl: `/micro-app/${encodedAppId}/icon?size=180`,
	}
}

module.exports = buildInstallLinks
