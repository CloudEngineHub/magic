import { useMemo } from "react"
import { action, computed, makeObservable, observable } from "mobx"
import type { MessageTurnGroup } from "../message-turn-groups"

export const MAX_EXPORT_COUNT = 30

export interface ExportSelectionWarning {
	type: "limit" | "truncate"
	limit: number
}

export class ExportSelectionStore {
	exportMode = false
	selectedKeys = observable.set<string>()
	includeToolCall = false
	previewOpen = false

	onWarn?: (warning: ExportSelectionWarning) => void

	constructor() {
		makeObservable(this, {
			exportMode: observable,
			includeToolCall: observable,
			previewOpen: observable,
			count: computed,
			enter: action,
			exit: action,
			toggle: action,
			selectAll: action,
			clear: action,
			setIncludeToolCall: action,
			openPreview: action,
			closePreview: action,
		})
	}

	get count(): number {
		return this.selectedKeys.size
	}

	isSelected(key: string): boolean {
		return this.selectedKeys.has(key)
	}

	enter(): void {
		this.exportMode = true
		this.selectedKeys.clear()
		this.previewOpen = false
	}

	exit(): void {
		this.exportMode = false
		this.selectedKeys.clear()
		this.previewOpen = false
	}

	toggle(key: string): void {
		if (!key) return
		if (this.selectedKeys.has(key)) {
			this.selectedKeys.delete(key)
			return
		}
		if (this.selectedKeys.size >= MAX_EXPORT_COUNT) {
			this.onWarn?.({ type: "limit", limit: MAX_EXPORT_COUNT })
			return
		}
		this.selectedKeys.add(key)
	}

	selectAll(allKeys: string[]): void {
		const truncated = allKeys.length > MAX_EXPORT_COUNT
		const take = allKeys.slice(0, MAX_EXPORT_COUNT)
		this.selectedKeys.clear()
		take.forEach((k) => this.selectedKeys.add(k))
		if (truncated) this.onWarn?.({ type: "truncate", limit: MAX_EXPORT_COUNT })
	}

	clear(): void {
		this.selectedKeys.clear()
	}

	setIncludeToolCall(v: boolean): void {
		this.includeToolCall = v
	}

	openPreview(): void {
		this.previewOpen = true
	}

	closePreview(): void {
		this.previewOpen = false
	}
}

/** Stable per-MessageList instance store. */
export function useExportSelectionStore(): ExportSelectionStore {
	return useMemo(() => new ExportSelectionStore(), [])
}

/** Filter selectable turn groups (skip leading/non-user groups). */
export function getSelectableTurnKeys(groups: MessageTurnGroup[]): string[] {
	return groups.filter((g) => g.stickyItem != null).map((g) => g.key)
}
