import { createRoot, type Root } from "react-dom/client"
import AppearanceProvider from "@/providers/AppearanceProvider"
import { type AgentCommonModalProps, AgentCommonModalRef } from "./types"
import { userStore } from "@/models/user"
import { reaction } from "mobx"
import { createRef, lazy, Suspense } from "react"
import { MagicWidgetContextProvider } from "@/providers/MagicWidgetProvider/context"
import type { MagicWidgetContextValue } from "@/providers/MagicWidgetProvider/types"

const AgentCommonModal = lazy(() =>
	import("./AgentCommonModal").then((module) => ({
		default: module.AgentCommonModal,
	})),
)

// Global registry to track active modals and prevent conflicts
interface ModalInstance {
	div: HTMLDivElement
	root: Root
	disposer: () => void
	isCleaningUp: boolean
}

const activeModals = new Set<ModalInstance>()

type OpenAgentCommonModalProps = AgentCommonModalProps & {
	widgetContext?: MagicWidgetContextValue
}

export function openAgentCommonModal(props: OpenAgentCommonModalProps) {
	const { widgetContext, ...modalProps } = props
	const div = document.createElement("div")
	document.body.appendChild(div)

	const root = createRoot(div)
	const modalRef = createRef<AgentCommonModalRef>()

	const disposer = reaction(
		() => [userStore.user.organizationCode, userStore.user.userInfo?.magic_id],
		() => {
			handleClose()
		},
	)

	// Register this modal instance
	const instance: ModalInstance = {
		div,
		root,
		disposer,
		isCleaningUp: false,
	}
	activeModals.add(instance)

	function handleClose() {
		if (instance.isCleaningUp) return

		instance.isCleaningUp = true

		try {
			instance.disposer()
		} catch (error) {
			console.warn("Error disposing AgentCommonModal reaction:", error)
		}

		// Defer unmount to the next macrotask: afterClose runs during React commit/effects;
		// synchronous root.unmount() triggers "unmount while already rendering" (see openFlowModal).
		setTimeout(() => {
			try {
				instance.root.unmount()
				if (instance.div.parentNode) {
					instance.div.parentNode.removeChild(instance.div)
				}
			} catch (error) {
				console.warn("Error during AgentCommonModal root cleanup:", error)
			} finally {
				activeModals.delete(instance)
			}
		}, 0)
	}

	const modal = (
		<AppearanceProvider>
			<Suspense fallback={null}>
				<AgentCommonModal
					{...modalProps}
					ref={modalRef}
					getContainer={() => div}
					onClose={() => {
						modalProps.onClose?.()
						handleClose()
					}}
					maskClosable={false}
				/>
			</Suspense>
		</AppearanceProvider>
	)

	root.render(
		widgetContext ? (
			<MagicWidgetContextProvider value={widgetContext}>{modal}</MagicWidgetContextProvider>
		) : (
			modal
		),
	)

	return { onClose: () => modalRef.current?.close() }
}

export type { AgentCommonModalChildrenProps, AgentCommonModalProps } from "./types"

export { AgentCommonModal } from "./AgentCommonModal"
