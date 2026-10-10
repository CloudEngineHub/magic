const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export function renderTemplate(template: string, payload: Record<string, unknown>) {
	return template.replace(PLACEHOLDER, (_match, key: string) => {
		const value = payload[key]
		if (value == null || value === "") return "-"
		return String(value)
	})
}

export function templateCatalogKey(type: string, version: number) {
	return `${type}:${version}`
}
