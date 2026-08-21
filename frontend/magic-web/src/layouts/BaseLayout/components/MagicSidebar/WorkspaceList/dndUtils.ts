import type { SidebarDropPosition } from "./types"

export const INSERT_LINE_COLOR = "#b9dcff"
export const EDGE_SCROLL_ZONE = 56
export const MAX_EDGE_SCROLL_SPEED = 14

/** Returns the insertion side for a row and pointer Y coordinate. */
export function getDropPosition(target: HTMLElement, clientY: number): SidebarDropPosition {
	const rect = target.getBoundingClientRect()
	return clientY < rect.top + rect.height / 2 ? "before" : "after"
}

/** Returns one shared Y coordinate for both sides of the same item gap. */
export function getIndicatorLineY(
	target: HTMLElement,
	position: SidebarDropPosition,
	container?: HTMLElement | null,
) {
	const targetRect = target.getBoundingClientRect()
	const dropType = target.dataset.sidebarDropType || target.dataset.collapsedSidebarDndDropType
	const targetSelector = dropType
		? `[data-sidebar-drop-type="${dropType}"], [data-collapsed-sidebar-dnd-drop-type="${dropType}"]`
		: ""
	const targets =
		container && targetSelector
			? Array.from(container.querySelectorAll<HTMLElement>(targetSelector))
			: []
	const targetIndex = targets.indexOf(target)
	const sibling =
		targetIndex !== -1
			? targets[position === "before" ? targetIndex - 1 : targetIndex + 1]
			: position === "before"
				? target.previousElementSibling
				: target.nextElementSibling
	if (!(sibling instanceof HTMLElement)) {
		return position === "before" ? targetRect.top : targetRect.bottom
	}

	const siblingDropType =
		sibling.dataset.sidebarDropType || sibling.dataset.collapsedSidebarDndDropType
	if (!dropType || siblingDropType !== dropType) {
		return position === "before" ? targetRect.top : targetRect.bottom
	}

	const siblingRect = sibling.getBoundingClientRect()
	return position === "before"
		? (siblingRect.bottom + targetRect.top) / 2
		: (targetRect.bottom + siblingRect.top) / 2
}

/** Returns the nearest project row when the pointer is in list padding or a row gap. */
export function getNearestProjectTarget(
	projectList: HTMLElement,
	clientY: number,
	excludedProjectId: string | undefined,
	rowSelector: string,
	projectIdKey: string,
) {
	const projectTargets = Array.from(
		projectList.querySelectorAll<HTMLElement>(rowSelector),
	).filter((target) => target.dataset[projectIdKey] !== excludedProjectId)

	let nearestTarget: HTMLElement | null = null
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const target of projectTargets) {
		const rect = target.getBoundingClientRect()
		if (clientY >= rect.top && clientY <= rect.bottom) return target
		const distance = Math.abs(clientY - (rect.top + rect.height / 2))
		if (distance < nearestDistance) {
			nearestDistance = distance
			nearestTarget = target
		}
	}
	return nearestTarget
}

/** Returns the nearest workspace row when the pointer is in a row gap. */
export function getNearestWorkspaceTarget(
	workspaceList: HTMLElement | null,
	clientY: number,
	excludedWorkspaceId: string | undefined,
	rowSelector: string,
	workspaceIdKey: string,
) {
	if (!workspaceList) return null
	const listRect = workspaceList.getBoundingClientRect()
	if (clientY < listRect.top || clientY > listRect.bottom) return null

	const workspaceTargets = Array.from(
		workspaceList.querySelectorAll<HTMLElement>(rowSelector),
	).filter((target) => target.dataset[workspaceIdKey] !== excludedWorkspaceId)

	let nearestTarget: HTMLElement | null = null
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const target of workspaceTargets) {
		const rect = target.getBoundingClientRect()
		if (clientY >= rect.top && clientY <= rect.bottom) return target
		const distance = Math.abs(clientY - (rect.top + rect.height / 2))
		if (distance < nearestDistance) {
			nearestDistance = distance
			nearestTarget = target
		}
	}
	return nearestTarget
}

/** Moves one item while preserving the requested insertion side. */
export function insertAtPosition<T>(
	items: T[],
	sourceIndex: number,
	targetIndex: number,
	position: SidebarDropPosition,
) {
	const next = [...items]
	const [item] = next.splice(sourceIndex, 1)
	if (!item) return items
	const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
	const insertIndex = position === "after" ? adjustedTarget + 1 : adjustedTarget
	next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, item)
	return next
}

/** Returns true when the requested insertion leaves the source unchanged. */
export function isNoOpInsertion(
	sourceIndex: number,
	targetIndex: number,
	position: SidebarDropPosition,
	itemCount: number,
) {
	const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
	const insertIndex = position === "after" ? adjustedTarget + 1 : adjustedTarget
	return Math.max(0, Math.min(insertIndex, itemCount - 1)) === sourceIndex
}

/** Returns a signed scroll speed from the pointer's distance to a container edge. */
export function getEdgeScrollSpeed(container: HTMLElement, clientY: number) {
	const rect = container.getBoundingClientRect()
	if (clientY < rect.top || clientY > rect.bottom) return 0

	const topDistance = clientY - rect.top
	if (topDistance < EDGE_SCROLL_ZONE) {
		return -Math.max(2, MAX_EDGE_SCROLL_SPEED * (1 - topDistance / EDGE_SCROLL_ZONE))
	}

	const bottomDistance = rect.bottom - clientY
	if (bottomDistance < EDGE_SCROLL_ZONE) {
		return Math.max(2, MAX_EDGE_SCROLL_SPEED * (1 - bottomDistance / EDGE_SCROLL_ZONE))
	}

	return 0
}

/** Creates a native drag preview with the dragged item's type icon. */
export function createSidebarDragImage(
	label: string,
	type: "workspace" | "project" | "project-list",
) {
	if (typeof document === "undefined") return null

	const image = document.createElement("div")
	const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
	const iconSize = 16
	icon.setAttribute("width", String(iconSize))
	icon.setAttribute("height", String(iconSize))
	icon.setAttribute("viewBox", "0 0 24 24")
	icon.setAttribute("fill", "none")
	icon.setAttribute("stroke", "currentColor")
	icon.setAttribute("stroke-width", "1.8")
	icon.setAttribute("stroke-linecap", "round")
	icon.setAttribute("stroke-linejoin", "round")
	const iconPaths =
		type === "workspace"
			? [
					"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
					"m3.3 7 8.7 5 8.7-5",
					"M12 22V12",
				]
			: [
					"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
				]
	for (const pathData of iconPaths) {
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
		path.setAttribute("d", pathData)
		icon.appendChild(path)
	}
	if (type !== "workspace") {
		const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle")
		dot.setAttribute("cx", "12")
		dot.setAttribute("cy", "13")
		dot.setAttribute("r", "1")
		icon.appendChild(dot)
	}
	const text = document.createElement("span")
	text.textContent = label
	image.append(icon, text)
	image.style.cssText = [
		"position:fixed",
		"top:-1000px",
		"left:-1000px",
		"z-index:9999",
		"pointer-events:none",
		"user-select:none",
		"display:flex",
		"align-items:center",
		"gap:8px",
		"max-width:260px",
		"height:28px",
		"padding:0 10px",
		"border-radius:8px",
		"background:#ffffff",
		"box-shadow:0 0 1px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.1)",
		"color:#1c1d23",
		"font:500 12px/1.2 -apple-system,BlinkMacSystemFont,sans-serif",
		"white-space:nowrap",
		"overflow:hidden",
		"text-overflow:ellipsis",
	].join(";")
	document.body.appendChild(image)
	return image
}

/** Creates the shared SVG insertion indicator and appends it to the document. */
export function createSidebarDropIndicator() {
	const indicator = document.createElementNS("http://www.w3.org/2000/svg", "svg")
	indicator.setAttribute("aria-hidden", "true")
	indicator.style.cssText = [
		"position:fixed",
		"display:none",
		"pointer-events:none",
		"z-index:10000",
		"overflow:visible",
	].join(";")

	const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
	line.setAttribute("x1", "4")
	line.setAttribute("y1", "4")
	line.setAttribute("y2", "4")
	line.setAttribute("stroke", "currentColor")
	line.setAttribute("stroke-width", "2")
	const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
	circle.setAttribute("cx", "4")
	circle.setAttribute("cy", "4")
	circle.setAttribute("r", "4")
	circle.setAttribute("fill", "currentColor")
	indicator.append(line, circle)
	document.body.appendChild(indicator)
	return indicator
}
