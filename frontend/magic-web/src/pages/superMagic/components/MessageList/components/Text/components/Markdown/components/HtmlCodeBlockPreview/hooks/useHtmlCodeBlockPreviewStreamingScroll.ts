import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from "react"
import type { HtmlCodeBlockPreviewStreamingScrollState } from "../types"

// 流式 HTML 代码块滚动控制所需的输入。
// 目标是：内容持续增长时自动贴底，但一旦用户手动查看历史内容，就停止强制滚动。
interface HtmlCodeBlockPreviewStreamingScrollHookOptions {
	isStreaming: boolean
	hasCompletedFence: boolean
	codeContent: string
	streamingScrollStateRef: MutableRefObject<HtmlCodeBlockPreviewStreamingScrollState>
}

// 只要用户离底部超过这个阈值，就认为用户正在主动查看历史内容。
const HTML_CODE_BLOCK_PREVIEW_STREAMING_SCROLL_BOTTOM_THRESHOLD = 10

// 这个 hook 专门处理“流式代码输出时自动滚到底”的行为。
// 它不会自己渲染 UI，只负责维护滚动状态和在合适的时机触发贴底滚动。
export function useHtmlCodeBlockPreviewStreamingScroll(
	options: HtmlCodeBlockPreviewStreamingScrollHookOptions,
) {
	const { isStreaming, hasCompletedFence, codeContent, streamingScrollStateRef } = options
	const scrollAreaElementRef = useRef<HTMLDivElement | null>(null)
	const followUpScrollRafRef = useRef<number | null>(null)

	const setScrollAreaElement = useCallback((scrollAreaElement: HTMLDivElement | null) => {
		scrollAreaElementRef.current = scrollAreaElement
	}, [])

	useLayoutEffect(() => {
		// 这里依赖的是 ScrollArea 的 viewport，而不是外层容器本身。
		const viewportElement = scrollAreaElementRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		)

		if (!viewportElement) return

		function markUserInteracted() {
			const el = viewportElement as HTMLElement
			const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight

			streamingScrollStateRef.current.hasUserInteracted =
				distanceToBottom > HTML_CODE_BLOCK_PREVIEW_STREAMING_SCROLL_BOTTOM_THRESHOLD
		}

		viewportElement.addEventListener("wheel", markUserInteracted, { passive: true })
		viewportElement.addEventListener("touchstart", markUserInteracted, { passive: true })
		viewportElement.addEventListener("pointerdown", markUserInteracted, { passive: true })
		viewportElement.addEventListener("scroll", markUserInteracted, { passive: true })

		return () => {
			viewportElement.removeEventListener("wheel", markUserInteracted)
			viewportElement.removeEventListener("touchstart", markUserInteracted)
			viewportElement.removeEventListener("pointerdown", markUserInteracted)
			viewportElement.removeEventListener("scroll", markUserInteracted)
		}
	}, [streamingScrollStateRef, isStreaming, hasCompletedFence, codeContent])

	useLayoutEffect(() => {
		if (!isStreaming || hasCompletedFence) {
			// 一旦流式结束，就重置交互状态，避免影响下一次新的流式内容。
			streamingScrollStateRef.current.hasUserInteracted = false

			if (followUpScrollRafRef.current) {
				window.cancelAnimationFrame(followUpScrollRafRef.current)
				followUpScrollRafRef.current = null
			}

			return
		}

		const viewportElement = scrollAreaElementRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		)

		// 用户已经主动滚离底部时，不再强制把视图拉回去。
		if (!viewportElement || streamingScrollStateRef.current.hasUserInteracted) return

		viewportElement.scrollTop = viewportElement.scrollHeight

		// XMarkdown 解析/分块可能在同一次 commit 的下一帧才撑高 scrollHeight，补一次贴底。
		if (followUpScrollRafRef.current) window.cancelAnimationFrame(followUpScrollRafRef.current)
		followUpScrollRafRef.current = window.requestAnimationFrame(() => {
			if (streamingScrollStateRef.current.hasUserInteracted) return
			viewportElement.scrollTop = viewportElement.scrollHeight
			followUpScrollRafRef.current = window.requestAnimationFrame(() => {
				followUpScrollRafRef.current = null
				if (streamingScrollStateRef.current.hasUserInteracted) return
				viewportElement.scrollTop = viewportElement.scrollHeight
			})
		})

		return () => {
			if (followUpScrollRafRef.current) {
				window.cancelAnimationFrame(followUpScrollRafRef.current)
				followUpScrollRafRef.current = null
			}
		}
	}, [codeContent, hasCompletedFence, isStreaming, streamingScrollStateRef])

	return {
		setScrollAreaElement,
	}
}
