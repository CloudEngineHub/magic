export interface LinkedTextConnection {
	connectionId: string
	sourceElementId: string
	text: string
}

export function composePromptSegments(segments: Array<string | undefined>): string {
	return segments.filter((segment) => Boolean(segment?.trim())).join("\n")
}

export function getLinkedTextPromptText(connections: LinkedTextConnection[]): string {
	return composePromptSegments(connections.map((connection) => connection.text))
}

export function composePromptWithLinkedText(
	linkedPromptText: string,
	editablePrompt?: string,
): string {
	return composePromptSegments([linkedPromptText, editablePrompt])
}
