import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react"

export const MODEL_DETAILS_HOVER_OPEN_DELAY_MS = 80
export const MODEL_DETAILS_HOVER_SWITCH_DELAY_MS = 140
export const MODEL_DETAILS_HOVER_CLOSE_DELAY_MS = 240

/** 同一模型列表只展开一份详情，统一取消跨行及跨 Portal 的悬停计时。 */
function useModelDetailsController() {
	const [activeId, setActiveId] = useState<string | null>(null)
	const active = useRef<string | null>(null)
	const pending = useRef<string | null>(null)
	const openTimer = useRef<ReturnType<typeof setTimeout>>()
	const closeTimer = useRef<ReturnType<typeof setTimeout>>()

	/** 进入详情或子菜单时取消切换，避免斜向移动经过其他模型行。 */
	const keepOpen = useCallback(() => {
		clearTimeout(openTimer.current)
		clearTimeout(closeTimer.current)
		pending.current = null
	}, [])

	/** 首次打开快速响应；跨行切换略留缓冲，避免斜向移动误切换。 */
	const requestOpen = useCallback(
		(id: string, immediate = false) => {
			keepOpen()
			if (active.current === id) return
			pending.current = id
			const apply = () => {
				active.current = id
				pending.current = null
				setActiveId(id)
			}
			if (immediate) apply()
			else
				openTimer.current = setTimeout(
					apply,
					active.current
						? MODEL_DETAILS_HOVER_SWITCH_DELAY_MS
						: MODEL_DETAILS_HOVER_OPEN_DELAY_MS,
				)
		},
		[keepOpen],
	)

	/** 离开三级区域后延迟关闭；旧模型的关闭任务不能关闭新模型。 */
	const requestClose = useCallback((id: string, immediate = false) => {
		// 选择、Esc 或点击外部属于显式关闭，不能留下稍后打开另一行的任务。
		if (immediate && active.current === id) {
			clearTimeout(openTimer.current)
			pending.current = null
		}
		if (pending.current === id) {
			clearTimeout(openTimer.current)
			pending.current = null
		}
		if (active.current !== id) return
		clearTimeout(closeTimer.current)
		const apply = () => {
			if (active.current !== id) return
			active.current = null
			setActiveId(null)
		}
		if (immediate) apply()
		else closeTimer.current = setTimeout(apply, MODEL_DETAILS_HOVER_CLOSE_DELAY_MS)
	}, [])

	useEffect(() => keepOpen, [keepOpen])
	return { activeId, requestOpen, requestClose, keepOpen }
}

const ModelDetailsContext = createContext<ReturnType<typeof useModelDetailsController> | null>(null)

/** 将互斥详情状态限制在一个选择列表中，不影响其他编辑器或窗口。 */
export function ModelDetailsHoverProvider({ children }: { children: ReactNode }) {
	const controller = useModelDetailsController()
	return (
		<ModelDetailsContext.Provider value={controller}>{children}</ModelDetailsContext.Provider>
	)
}

/** 独立使用组件时保留本地控制器，列表使用统一控制器。 */
export function useModelDetailsHover() {
	const shared = useContext(ModelDetailsContext)
	const local = useModelDetailsController()
	return shared ?? local
}
