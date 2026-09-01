export function getInspectorDetailHeaderLabel(
	t: (key: string) => string,
	textContent?: string,
): string {
	const normalizedText = textContent?.replace(/\s+/g, " ").trim()
	return normalizedText || t("stylePanel.inspector.selectedElement")
}
