export interface IconBackup {
	element: Element
	replacement: HTMLElement
	originalDisplay: string
}

export function materializePseudoIcons(_document: Document, _window: Window): IconBackup[] {
	return []
}

export function restoreIcons(_backups: IconBackup[]): void {
	// The default implementation does not materialize pseudo-element icons; extensions can override this logic.
}
