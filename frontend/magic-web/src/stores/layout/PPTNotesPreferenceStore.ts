import { makeAutoObservable } from "mobx"

const STORAGE_KEY = "supermagic-ppt-notes-visible"
const HEIGHT_STORAGE_KEY = "supermagic-ppt-notes-height"

/** One browser-wide preference, shared by every PPT rather than stored per file. */
export class PPTNotesPreferenceStore {
	visible = false
	height = 144

	constructor() {
		try {
			this.visible = localStorage.getItem(STORAGE_KEY) === "true"
			const height = Number(localStorage.getItem(HEIGHT_STORAGE_KEY))
			if (Number.isFinite(height) && height >= 100) this.height = height
		} catch {
			// Storage restrictions must not prevent opening a presentation.
		}
		makeAutoObservable(this, {}, { autoBind: true })
	}

	setHeight(height: number) {
		if (!Number.isFinite(height) || height < 100) return
		this.height = height
		try {
			localStorage.setItem(HEIGHT_STORAGE_KEY, String(height))
		} catch {
			// Resizing remains available when browser storage is restricted.
		}
	}

	setVisible(visible: boolean) {
		this.visible = visible
		try {
			localStorage.setItem(STORAGE_KEY, String(visible))
		} catch {
			// Keep the preference usable in memory when storage is unavailable.
		}
	}

	toggle() {
		this.setVisible(!this.visible)
	}
}

export const pptNotesPreferenceStore = new PPTNotesPreferenceStore()
