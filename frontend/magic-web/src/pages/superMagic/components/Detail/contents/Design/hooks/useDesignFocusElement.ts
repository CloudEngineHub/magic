import { useRef, useCallback, useEffect } from "react"
import { useLatest } from "ahooks"
import { CanvasDesignRef } from "@/components/CanvasDesign/public/props"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { SuperMagicFocusCanvasElementPayload } from "@/pages/superMagic/events/markers"

interface UseDesignFocusElementProps {
	isPlaybackMode?: boolean
	designProjectId?: string
	isInitialLoading: boolean
	canvasDesignRef: React.RefObject<CanvasDesignRef | null>
}

export function useDesignFocusElement({
	isPlaybackMode: isPlaybackModeProp,
	designProjectId,
	isInitialLoading,
	canvasDesignRef,
}: UseDesignFocusElementProps) {
	const isInitialLoadingRef = useLatest(isInitialLoading)

	// 待办事件队列：存储初始化完成前收到的回调函数
	const pendingCallbacksRef = useRef<Array<() => void>>([])

	// 处理聚焦元素的函数
	const handleFocusElement = useCallback(
		(data: SuperMagicFocusCanvasElementPayload) => {
			const {
				isFromPlaybackToolNode,
				animated,
				canvasDesignId,
				elementIds,
				selectElement,
				padding,
				showGenerationDetails,
				contentId,
			} = data
			if (
				canvasDesignId !== designProjectId ||
				!!isPlaybackModeProp !== !!isFromPlaybackToolNode
			) {
				return
			}

			// 创建执行聚焦的回调函数
			const focusCallback = () => {
				canvasDesignRef.current?.focusElement(elementIds, {
					animated,
					selectElement,
					padding,
				})
				if (showGenerationDetails && elementIds.length === 1) {
					const canvas = canvasDesignRef.current?.getCanvasInstance()
					// 复用画布信息按钮事件，查看参数不会切换或写入主版本。
					canvas?.eventEmitter.emit({
						type: "element:image:infoButtonClick",
						data: { elementId: elementIds[0], contentId },
					})
				}
			}

			// 检查是否初始化完成：loading 完成且 ref 已准备好
			const isInitialized = !isInitialLoadingRef.current && canvasDesignRef.current !== null

			if (isInitialized) {
				// 初始化完成，直接执行
				focusCallback()
			} else {
				// 初始化未完成，将回调加入待办队列
				pendingCallbacksRef.current.push(focusCallback)
			}
		},
		[designProjectId, isPlaybackModeProp, isInitialLoadingRef, canvasDesignRef],
	)

	// 消费待办事件队列
	const consumePendingEvents = useCallback(() => {
		if (!canvasDesignRef.current || pendingCallbacksRef.current.length === 0) return

		// 执行队列中的所有回调
		const callbacks = [...pendingCallbacksRef.current]
		pendingCallbacksRef.current = []

		callbacks.forEach((callback) => {
			callback()
		})
	}, [canvasDesignRef])

	// 订阅事件
	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Super_Magic_Focus_Canvas_Element, handleFocusElement)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Super_Magic_Focus_Canvas_Element, handleFocusElement)
		}
	}, [handleFocusElement])

	// 监听初始化完成，消费待办事件
	useEffect(() => {
		if (!isInitialLoading && canvasDesignRef.current) {
			// 延迟执行，确保 CanvasDesign 完全初始化
			const timer = setTimeout(() => {
				consumePendingEvents()
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [isInitialLoading, consumePendingEvents, canvasDesignRef])

	return {
		handleFocusElement,
	}
}
