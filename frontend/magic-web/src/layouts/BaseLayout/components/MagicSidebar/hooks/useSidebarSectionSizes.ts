import { useLayoutEffect, useState, type RefObject } from "react"
import { SCROLL_HINT_HEIGHT } from "@/components/shadcn-ui/scroll-area"

interface SidebarSectionSizes {
	available: number
	apps: number
	minimumApp: number
	projects: number
	minimumProjects: number
	home: number
	projectsPending: boolean
}

const CONTENT_SELECTOR = "[data-sidebar-layout-content], [data-sidebar-navigation-header]"

function outerHeight(element: HTMLElement): number {
	const style = getComputedStyle(element)
	return (
		element.offsetHeight +
		(parseFloat(style.marginTop) || 0) +
		(parseFloat(style.marginBottom) || 0)
	)
}

/** 读取完整内容（含虚拟列表占位），不把当前受限视口高度当成内容所需高度。 */
export function useSidebarSectionSizes({
	rootRef,
	appsRef,
	projectsRef,
	dividerRef,
	homeRef,
	section,
	collapsed,
	busy,
}: {
	rootRef: RefObject<HTMLDivElement>
	appsRef: RefObject<HTMLDivElement>
	projectsRef: RefObject<HTMLDivElement>
	dividerRef: RefObject<HTMLDivElement>
	homeRef: RefObject<HTMLDivElement>
	section: string
	collapsed: boolean
	busy: boolean
}) {
	const [sizes, setSizes] = useState<SidebarSectionSizes | null>(null)
	useLayoutEffect(() => {
		const root = rootRef.current
		const apps = appsRef.current
		const projects = projectsRef.current
		const home = homeRef.current
		if (!root || !apps || !projects || !home) return
		const measure = () => {
			if (busy || !root.clientHeight || !root.clientWidth) return
			const focused = document.activeElement
			if (
				focused instanceof HTMLElement &&
				root.contains(focused) &&
				focused.matches("input, textarea, [contenteditable=true]")
			)
				return
			const headers = Array.from(
				projects.querySelectorAll<HTMLElement>("[data-sidebar-navigation-header]"),
			).filter((element) => element.getClientRects().length > 0)
			const content = Array.from(
				projects.querySelectorAll<HTMLElement>(
					'[data-sidebar-layout-content="navigation"]',
				),
			).find((element) => element.getClientRects().length > 0)
			const headerHeight = headers.reduce(
				(height, element) => height + outerHeight(element),
				0,
			)
			let contentHeight = content ? outerHeight(content) : 0
			// 工作空间中的每个项目列表有自己的滚动上限；加回被裁掉的虚拟高度，避免循环挤压预算。
			content
				?.querySelectorAll<HTMLElement>('[data-sidebar-layout-content="projects"]')
				.forEach((list) => {
					const viewport = list.closest<HTMLElement>("[data-project-scroll-container]")
					if (viewport)
						contentHeight += Math.max(0, list.offsetHeight - viewport.clientHeight)
				})
			const firstWorkspace = content?.querySelector<HTMLElement>(
				"[data-sidebar-workspace-root]",
			)
			const firstHeader = firstWorkspace?.querySelector<HTMLElement>(
				"[data-sidebar-workspace-header]",
			)
			const firstRow = (firstWorkspace ?? content)?.querySelector<HTMLElement>(
				"[data-virtual-project-id]",
			)
			const firstControl = content?.querySelector<HTMLElement>("button, a")
			const beforeWorkspace =
				firstWorkspace && content
					? Math.max(
							0,
							firstWorkspace.getBoundingClientRect().top -
								content.getBoundingClientRect().top,
						)
					: 0
			const minimumContent = firstHeader
				? beforeWorkspace + firstHeader.offsetHeight + (firstRow?.offsetHeight ?? 0)
				: (firstRow?.offsetHeight ?? firstControl?.offsetHeight ?? contentHeight)
			const hints = content && !collapsed ? SCROLL_HINT_HEIGHT * 2 : 0
			const firstApp = apps.querySelector<HTMLElement>('[data-sidebar="menu-item"]')
			const next: SidebarSectionSizes = {
				available: root.clientHeight - (dividerRef.current?.offsetHeight ?? 0),
				apps: apps.offsetHeight,
				minimumApp: firstApp
					? Math.min(apps.offsetHeight, outerHeight(firstApp) + SCROLL_HINT_HEIGHT * 2)
					: 0,
				projects: headerHeight + contentHeight + hints,
				minimumProjects: headerHeight + minimumContent + hints,
				home: home.offsetHeight,
				projectsPending:
					content?.dataset.sidebarHasMore === "true" ||
					Boolean(content?.querySelector('[data-sidebar-has-more="true"]')),
			}
			// 隐藏、挂载中或异常尺寸不更新已显示布局，也不把无效数值写进用户偏好。
			if (
				next.available <= 0 ||
				!Object.values(next).every(
					(value) => typeof value === "boolean" || (Number.isFinite(value) && value >= 0),
				)
			)
				return
			setSizes((previous) =>
				previous &&
				Object.entries(next).every(
					([key, value]) => previous[key as keyof SidebarSectionSizes] === value,
				)
					? previous
					: next,
			)
		}
		const observer = new ResizeObserver(measure)
		const observed = new Set<Element>()
		const observeContents = () => {
			const elements = new Set<Element>([
				root,
				apps,
				home,
				projects,
				...projects.querySelectorAll(CONTENT_SELECTOR),
			])
			if (dividerRef.current) elements.add(dividerRef.current)
			observed.forEach((element) => {
				if (!elements.has(element)) {
					observer.unobserve(element)
					observed.delete(element)
				}
			})
			elements.forEach((element) => {
				if (!observed.has(element)) {
					observer.observe(element)
					observed.add(element)
				}
			})
			measure()
		}
		observeContents()
		let disposed = false
		const afterEditing = () =>
			queueMicrotask(() => {
				if (!disposed) measure()
			})
		root.addEventListener("focusout", afterEditing)
		// 仅在栏目／工作区内容挂载时注册尺寸观察；虚拟行滚动不重新扫描整棵导航树。
		const mounts = new MutationObserver((records) => {
			if (
				records.some(
					(record) =>
						record.type === "attributes" ||
						[...record.addedNodes, ...record.removedNodes].some(
							(node) =>
								node instanceof Element &&
								(node.matches(CONTENT_SELECTOR) ||
									node.querySelector(CONTENT_SELECTOR)),
						),
				)
			)
				observeContents()
		})
		mounts.observe(projects, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-sidebar-has-more"],
		})
		return () => {
			disposed = true
			observer.disconnect()
			mounts.disconnect()
			root.removeEventListener("focusout", afterEditing)
		}
	}, [rootRef, appsRef, projectsRef, dividerRef, homeRef, section, collapsed, busy])
	return sizes
}
