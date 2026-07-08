import type { DuplicateFileModalProps } from "./DuplicateFileModal"

interface SharedDuplicateHandler {
	modalVisible: boolean
	currentFileName: string
	totalDuplicates?: number
	handleCancel: () => void
	handleReplace: (applyToAll: boolean) => void
	handleKeepBoth: (applyToAll: boolean) => void
}

interface OperationDuplicateHandler {
	duplicateModalVisible: boolean
	currentDuplicateFileName: string
	totalDuplicates?: number
	handleDuplicateCancel: () => void
	handleDuplicateReplace: (applyToAll: boolean) => void
	handleDuplicateKeepBoth: (applyToAll: boolean) => void
}

interface GetDuplicateFileModalPropsOptions {
	externalDuplicateHandler?: unknown
	sharedDuplicateHandler: SharedDuplicateHandler
	moveDuplicateHandler: OperationDuplicateHandler
	crossProjectDuplicateHandler: OperationDuplicateHandler
	importDuplicateHandler: OperationDuplicateHandler
}

const noop = () => undefined

const hiddenDuplicateFileModalProps: DuplicateFileModalProps = {
	visible: false,
	fileName: "",
	totalDuplicates: 0,
	onCancel: noop,
	onReplace: noop,
	onKeepBoth: noop,
}

function getOperationDuplicateModalProps(
	handler: OperationDuplicateHandler,
): DuplicateFileModalProps {
	return {
		visible: true,
		fileName: handler.currentDuplicateFileName,
		totalDuplicates: handler.totalDuplicates,
		onCancel: handler.handleDuplicateCancel,
		onReplace: handler.handleDuplicateReplace,
		onKeepBoth: handler.handleDuplicateKeepBoth,
	}
}

export function getDuplicateFileModalProps({
	externalDuplicateHandler,
	sharedDuplicateHandler,
	moveDuplicateHandler,
	crossProjectDuplicateHandler,
	importDuplicateHandler,
}: GetDuplicateFileModalPropsOptions): DuplicateFileModalProps {
	if (!externalDuplicateHandler && sharedDuplicateHandler.modalVisible) {
		return {
			visible: true,
			fileName: sharedDuplicateHandler.currentFileName,
			totalDuplicates: sharedDuplicateHandler.totalDuplicates,
			onCancel: sharedDuplicateHandler.handleCancel,
			onReplace: sharedDuplicateHandler.handleReplace,
			onKeepBoth: sharedDuplicateHandler.handleKeepBoth,
		}
	}

	if (moveDuplicateHandler.duplicateModalVisible) {
		return getOperationDuplicateModalProps(moveDuplicateHandler)
	}

	if (crossProjectDuplicateHandler.duplicateModalVisible) {
		return getOperationDuplicateModalProps(crossProjectDuplicateHandler)
	}

	if (importDuplicateHandler.duplicateModalVisible) {
		return getOperationDuplicateModalProps(importDuplicateHandler)
	}

	return hiddenDuplicateFileModalProps
}