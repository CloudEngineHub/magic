import { useEffect } from "react"

function upsertInstallLink(rel: string, kind: string, href: string): HTMLLinkElement {
	const selector = `link[data-micro-app-install="${kind}"]`
	const existing = document.head.querySelector<HTMLLinkElement>(selector)
	const link = existing || document.createElement("link")
	link.rel = rel
	link.href = href
	link.dataset.microAppInstall = kind
	if (!existing) document.head.appendChild(link)
	return link
}

export default function useMicroAppManifestLinks(appId: string) {
	useEffect(() => {
		if (!appId) return
		const encodedAppId = encodeURIComponent(appId)
		const manifest = upsertInstallLink(
			"manifest",
			"manifest",
			`/micro-app/${encodedAppId}/manifest.webmanifest`,
		)
		const appleTouchIcon = upsertInstallLink(
			"apple-touch-icon",
			"apple-touch-icon",
			`/micro-app/${encodedAppId}/icon?size=180`,
		)

		return () => {
			manifest.remove()
			appleTouchIcon.remove()
		}
	}, [appId])
}
