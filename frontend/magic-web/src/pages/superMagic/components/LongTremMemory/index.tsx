import { lazy, Suspense } from "react"
import { openAgentCommonModal } from "@/components/Agent/AgentCommonModal"
import type { LongTremMemoryProps } from "./LongTremMemory"

const LongTremMemoryModal = lazy(() => import("./LongTremMemory"))

/** 渲染长期记忆弹窗内容。 */
export function LongTremMemory(props: LongTremMemoryProps) {
	return (
		<Suspense fallback={null}>
			<LongTremMemoryModal {...props} />
		</Suspense>
	)
}

/** 预加载长期记忆弹窗代码。 */
export function preloadLongTremMemoryModal() {
	return import("./LongTremMemory")
}

/** 打开个人中心全局长期记忆弹窗。 */
export function openLongTremMemoryModal({ onClose }: { onClose?: () => void } = {}) {
	openAgentCommonModal({
		width: 900,
		footer: null,
		closable: false,
		centered: true,
		onClose,
		children: <LongTremMemory />,
	})
}

declare global {
	interface Window {
		openLongTremMemoryModal?: typeof openLongTremMemoryModal
	}
}

// 调试入口沿用既有全局名称。
window.openLongTremMemoryModal = openLongTremMemoryModal
