export interface IconBackup {
	element: Element
	replacement: HTMLElement
	originalDisplay: string
}

export function materializePseudoIcons(_document: Document, _window: Window): IconBackup[] {
	return []
}

export function restoreIcons(_backups: IconBackup[]): void {
	// 默认实现不实体化伪元素图标，扩展实现可覆盖该逻辑。
}
