const { baseUrl } = require("../config")

/** Get a micro app's current project name for server-rendered page metadata. */
module.exports = async (appId) => {
	const apiUrl = `${baseUrl}/api/v1/open-api/super-magic/micro-apps/${encodeURIComponent(appId)}/title`
	const response = await fetch(apiUrl, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	})
	return await response.json()
}
