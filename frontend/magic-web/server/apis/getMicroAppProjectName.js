const { baseUrl } = require("../config")
const getSuperMagicShareResource = require("./getSuperMagicShareResource")

/** Get a published micro app's project name for server-rendered page metadata. */
module.exports = async (appId) => {
	const apiUrl = `${baseUrl}/api/v1/share/micro-apps/${encodeURIComponent(appId)}`
	const response = await fetch(apiUrl, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	})
	const publishedMicroApp = await response.json()
	const resourceId = publishedMicroApp?.data?.resource_id

	if (!resourceId) return null

	return await getSuperMagicShareResource(resourceId)
}
