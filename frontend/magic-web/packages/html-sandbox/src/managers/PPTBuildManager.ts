import type { CommandHistory } from "../core/CommandHistory"
import type { CommandRecord } from "../core/types"
import { getEditorNodeSelector } from "../features/domTree"
import {
	collectPPTBuilds,
	isPPTBuildElement,
	parsePPTBuild,
	PPT_BUILD_ATTRIBUTE,
	type PPTBuild,
} from "../utils/pptBuild"
import { getInspectableTextContent } from "../utils/inspectableTextContent"
import { getElementSelector } from "../utils/dom"

export interface PPTBuildEntry {
	selector: string
	label: string
	build: PPTBuild
}

export interface PPTBuildUpdate {
	selector: string
	build: PPTBuild | null
}

interface BuildState {
	selector: string
	value: string | null
}

/** Authored build metadata shares the editor's undo stack, but no unrelated attributes. */
export class PPTBuildManager {
	constructor(
		private history: CommandHistory,
		private isEditMode: () => boolean,
	) {}

	getBuilds(): PPTBuildEntry[] {
		return collectPPTBuilds(document)
			.map(({ element, build }) => ({
				// Match canvas selection payloads; history separately uses stable session IDs.
				selector: getElementSelector(element),
				label:
					element.getAttribute("aria-label")?.trim() ||
					element.getAttribute("alt")?.trim() ||
					getInspectableTextContent(element).slice(0, 80) ||
					element.id ||
					element.tagName.toLowerCase(),
				build,
			}))
			.sort((a, b) => a.build.step - b.build.step)
	}

	updateBuilds(updates: PPTBuildUpdate[]): void {
		if (!this.isEditMode()) throw new Error("PPT_BUILD_EDIT_MODE_REQUIRED")
		if (!Array.isArray(updates)) throw new Error("PPT_BUILD_INVALID")
		const changes = new Map<HTMLElement, BuildState>()
		for (const update of updates) {
			if (!update || typeof update.selector !== "string") throw new Error("PPT_BUILD_INVALID")
			const element = this.resolve(update.selector)
			if (changes.has(element)) throw new Error("PPT_BUILD_DUPLICATE")
			const build = update.build === null ? null : parsePPTBuild(JSON.stringify(update.build))
			if (update.build !== null && !build) throw new Error("PPT_BUILD_INVALID")
			changes.set(element, {
				selector: update.selector,
				value: build ? JSON.stringify(build) : null,
			})
		}

		// Validate the final batch, so removing a parent and adding its child is atomic.
		// Runtime nodes never block an authored build or enter its persisted history.
		const finalBuilds = new Set<HTMLElement>()
		document.querySelectorAll<HTMLElement>(`[${PPT_BUILD_ATTRIBUTE}]`).forEach((element) => {
			if (
				isPPTBuildElement(element) &&
				parsePPTBuild(element.getAttribute(PPT_BUILD_ATTRIBUTE))
			)
				finalBuilds.add(element)
		})
		for (const [element, change] of changes) {
			if (change.value === null) finalBuilds.delete(element)
			else finalBuilds.add(element)
		}
		for (const [element, change] of changes) {
			if (change.value === null) continue
			for (const other of finalBuilds) {
				if (other !== element && (other.contains(element) || element.contains(other)))
					throw new Error("PPT_BUILD_NESTED")
			}
		}

		const previous: BuildState[] = []
		const next: BuildState[] = []
		for (const [element, change] of changes) {
			const value = element.getAttribute(PPT_BUILD_ATTRIBUTE)
			if (value === change.value) continue
			change.selector = getEditorNodeSelector(element)
			previous.push({ selector: change.selector, value })
			next.push(change)
		}
		if (!next.length) return
		this.apply(next)
		this.history.push({
			commandType: "UPDATE_PPT_BUILDS",
			payload: next,
			previousState: previous,
			timestamp: Date.now(),
			metadata: { canUndo: true, description: "Update presentation builds" },
		})
	}

	canHandleCommand(commandType: string): boolean {
		return commandType === "UPDATE_PPT_BUILDS"
	}

	restoreCommand(command: CommandRecord): boolean {
		if (!this.canHandleCommand(command.commandType)) return false
		this.apply(command.previousState as BuildState[])
		return true
	}

	applyCommand(command: CommandRecord): boolean {
		if (!this.canHandleCommand(command.commandType)) return false
		this.apply(command.payload as BuildState[])
		return true
	}

	private resolve(selector: string): HTMLElement {
		const elements = document.querySelectorAll(selector)
		if (elements.length !== 1 || !isPPTBuildElement(elements[0]))
			throw new Error("PPT_BUILD_INVALID")
		return elements[0] as HTMLElement
	}

	private apply(states: BuildState[]): void {
		// Resolve every target before writing; a missing target must not partially replay.
		const elements = states.map((state) => this.resolve(state.selector))
		states.forEach((state, index) => {
			if (state.value === null) elements[index].removeAttribute(PPT_BUILD_ATTRIBUTE)
			else elements[index].setAttribute(PPT_BUILD_ATTRIBUTE, state.value)
		})
	}
}
