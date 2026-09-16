import { makeAutoObservable } from "mobx"

const STORAGE_KEY = "supermagic-ppt-notes-visible"

/** One browser-wide preference, shared by every PPT rather than stored per file. */
export class PPTNotesPreferenceStore {
	visible = false

	constructor() {
		try {
			this.visible = localStorage.getItem(STORAGE_KEY) === "true"
		} catch {
			// Storage restrictions must not prevent opening a presentation.
		}
		makeAutoObservable(this, {}, { autoBind: true })
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
