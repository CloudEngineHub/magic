import { createContext, useContext, useMemo, type ReactNode } from "react"

/**
 * 嵌套浮层交互作用域。
 *
 * Radix 的菜单、Popover、Select 等组件通常通过 Portal 挂载到 body。用户在内层浮层
 * 操作时，外层浮层会收到 interactOutside 事件，并可能被误判为点击外部而关闭。
 * 本模块为同一组件树中的浮层添加作用域标记，让外层浮层能够识别属于自己的内层浮层。
 *
 * 部分业务会把 Provider 内的 React 节点再次 Portal 到外层浮层容器。此时 React Context
 * 仍按组件树传递，但触发器的实际 DOM 位置可能与组件树不同，因此还需要 DOM 边界标记作为回退判断。
 */
const OVERLAY_SCOPE_ATTRIBUTE = "data-overlay-interaction-scopes"
const OVERLAY_SCOPE_BOUNDARY_ATTRIBUTE = "data-overlay-interaction-scope-boundary"
const OVERLAY_CONTENT_ATTRIBUTE = "data-overlay-interaction-content"

const OverlayInteractionScopeContext = createContext<readonly string[]>([])

interface OverlayInteractionScopeProviderProps {
	children: ReactNode
	scopeId: string
}

/**
 * 为 children 中创建的浮层声明交互作用域。
 *
 * scopeId 会与父级作用域合并，因此多层嵌套浮层既属于当前作用域，也保留祖先作用域，
 * 外层任一级浮层都能正确识别后代浮层中的交互。
 */
function OverlayInteractionScopeProvider({
	children,
	scopeId,
}: OverlayInteractionScopeProviderProps) {
	const parentScopeIds = useContext(OverlayInteractionScopeContext)
	const scopeIds = useMemo(() => [...parentScopeIds, scopeId], [parentScopeIds, scopeId])

	return (
		<OverlayInteractionScopeContext.Provider value={scopeIds}>
			{children}
		</OverlayInteractionScopeContext.Provider>
	)
}

/**
 * 将当前 React 作用域写入浮层触发器和内容节点。
 * shadcn-ui 的各类浮层组件统一调用此 Hook，确保 Portal 后仍可从事件目标识别作用域。
 */
function useOverlayInteractionScopeAttributes() {
	const scopeIds = useContext(OverlayInteractionScopeContext)

	return scopeIds.length > 0 ? { [OVERLAY_SCOPE_ATTRIBUTE]: scopeIds.join(" ") } : undefined
}

/** 标记浮层内容节点，并在存在 Provider 时同时写入当前作用域。 */
function useOverlayInteractionScopeContentAttributes() {
	const scopeAttributes = useOverlayInteractionScopeAttributes()

	return { [OVERLAY_CONTENT_ATTRIBUTE]: "", ...scopeAttributes }
}

/**
 * 标记外层浮层的实际 DOM 边界。
 * 当内层浮层无法直接继承作用域属性时，可通过其触发器是否位于该边界内判断归属关系。
 */
function getOverlayInteractionScopeBoundaryAttributes(scopeId: string | undefined) {
	return scopeId ? { [OVERLAY_SCOPE_BOUNDARY_ATTRIBUTE]: scopeId } : undefined
}

// 沿 DOM 祖先向上查找，而不是沿 React 组件树查找，用于处理业务层额外 Portal 的场景。
function isWithinScopeBoundary(element: Element, scopeId: string) {
	let currentElement: Element | null = element

	while (currentElement) {
		if (
			currentElement
				.getAttribute(OVERLAY_SCOPE_BOUNDARY_ATTRIBUTE)
				?.split(/\s+/)
				.includes(scopeId)
		) {
			return true
		}
		currentElement = currentElement.parentElement
	}

	return false
}

/**
 * 根据 Radix 生成的 aria-labelledby / aria-controls 关系查找浮层触发器。
 * 两种属性都检查，是为了兼容不同类型的 Radix 浮层及其触发器实现。
 */
function getOverlayOwnerElements(overlayContent: HTMLElement) {
	const ownerElements = new Set<Element>()
	const labelledByIds = overlayContent.getAttribute("aria-labelledby")?.split(/\s+/) ?? []

	labelledByIds.forEach((ownerId) => {
		const ownerElement = document.getElementById(ownerId)
		if (ownerElement) ownerElements.add(ownerElement)
	})

	if (overlayContent.id) {
		document.querySelectorAll<HTMLElement>("[aria-controls]").forEach((candidate) => {
			if (candidate.getAttribute("aria-controls")?.split(/\s+/).includes(overlayContent.id)) {
				ownerElements.add(candidate)
			}
		})
	}

	return ownerElements
}

// Context 标记缺失时，通过「浮层内容 -> 触发器 -> 外层 DOM 边界」恢复作用域归属。
function isOverlayOwnedByScope(node: Element, scopeId: string) {
	const overlayContent = node.closest<HTMLElement>(`[${OVERLAY_CONTENT_ATTRIBUTE}]`)
	if (!overlayContent) return false

	return Array.from(getOverlayOwnerElements(overlayContent)).some((ownerElement) =>
		isWithinScopeBoundary(ownerElement, scopeId),
	)
}

/**
 * 判断 interactOutside 事件是否实际发生在当前作用域所属的内层浮层中。
 *
 * 优先读取 Context 写入的显式作用域；若业务 Portal 改变了实际 DOM 挂载位置，再使用
 * 触发器与外层 DOM 边界的关联作为回退。只有返回 true 时，调用方才应阻止外层浮层关闭。
 */
function isInteractionWithinOverlayScope(event: Event, scopeId: string) {
	const outsideEvent = event as CustomEvent<{ originalEvent?: Event }>
	const originalEvent = outsideEvent.detail?.originalEvent
	const eventPath =
		originalEvent && typeof originalEvent.composedPath === "function"
			? originalEvent.composedPath()
			: []

	return [event.target, ...eventPath].some((node) => {
		if (!(node instanceof Element)) return false
		const overlay = node.closest<HTMLElement>(`[${OVERLAY_SCOPE_ATTRIBUTE}]`)
		const hasExplicitScope =
			overlay?.getAttribute(OVERLAY_SCOPE_ATTRIBUTE)?.split(/\s+/).includes(scopeId) ?? false

		return hasExplicitScope || isOverlayOwnedByScope(node, scopeId)
	})
}

export {
	OverlayInteractionScopeProvider,
	getOverlayInteractionScopeBoundaryAttributes,
	isInteractionWithinOverlayScope,
	useOverlayInteractionScopeAttributes,
	useOverlayInteractionScopeContentAttributes,
}
