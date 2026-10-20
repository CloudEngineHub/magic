import type { PPTBuildEntry, PPTBuildUpdate } from "../../iframe-bridge/types/props"

/** Queue groups correspond to clicks, not individual elements. */
export function groupBuildQueue(entries: PPTBuildEntry[]) {
	const groups = new Map<number, PPTBuildEntry[]>()
	for (const entry of entries) {
		const group = groups.get(entry.build.step) ?? []
		group.push(entry)
		groups.set(entry.build.step, group)
	}
	return [...groups].sort(([a], [b]) => a - b).map(([step, items]) => ({ step, items }))
}

/** Renumber all groups together so one undo restores the complete previous order. */
export function reorderBuildQueue(
	entries: PPTBuildEntry[],
	from: number,
	to: number,
): PPTBuildUpdate[] {
	const groups = groupBuildQueue(entries)
	if (from === to || from < 0 || to < 0 || from >= groups.length || to >= groups.length) return []
	const [moved] = groups.splice(from, 1)
	groups.splice(to, 0, moved)
	return groups.flatMap((group, index) =>
		group.items.map((entry) => ({
			selector: entry.selector,
			build: { ...entry.build, step: index + 1 },
		})),
	)
}

export function appendBuildStep(
	entries: PPTBuildEntry[],
	selector: string,
	effect: "appear" | "fade" = "fade",
): PPTBuildUpdate[] {
	const groups = groupBuildQueue(entries)
	if (groups.length >= 1000) return []
	const last = groups.at(-1)?.step ?? 0
	// Authored gaps may already reach 1000; normalize as part of the same undoable edit.
	const normalized =
		last >= 1000
			? groups.flatMap((group, index) =>
					group.items
						.filter((entry) => entry.selector !== selector)
						.map((entry) => ({
							selector: entry.selector,
							build: { ...entry.build, step: index + 1 },
						})),
				)
			: []
	return [
		...normalized,
		{
			selector,
			build: { version: 1, step: last >= 1000 ? groups.length + 1 : last + 1, effect },
		},
	]
}
