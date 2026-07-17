import { useMemoizedFn } from "ahooks"
import { useState } from "react"
import type { AttachmentItem } from "./types"
import { FilesDeleteConfirmSheet } from "../components/FilesDeleteConfirmSheet"
import { getAttachmentKey } from "../utils/getAttachmentKey"
import {
	buildDeleteConfirmHierarchyFromAttachments,
	type DeleteConfirmHierarchyGroup,
} from "../utils/mobileAttachmentTreeSelection"
import { resolveMagicDeleteWarningVariant } from "../utils/magic-system-folder"

interface MobileDeleteConfirmResolvedConfig {
	selectedHierarchy: DeleteConfirmHierarchyGroup[]
	magicWarningVariant: "none" | "single" | "multi"
	canvasWarning?: boolean
	canvasWarningContent?: string
	onConfirm: () => void | Promise<void>
	testIdPrefix?: string
}

/** Pre-built hierarchy payload (e.g. project-detail batch delete). */
interface OpenMobileDeleteConfirmWithHierarchy extends MobileDeleteConfirmResolvedConfig {}

/** Build hierarchy from attachment tree + selected keys (context menu / legacy mobile batch). */
interface OpenMobileDeleteConfirmFromSelection {
	attachments: AttachmentItem[]
	selectedKeys: Set<string>
	onConfirm: () => void | Promise<void>
	testIdPrefix?: string
	canvasWarning?: boolean
	canvasWarningContent?: string
}

type OpenMobileDeleteConfirmParams =
	| OpenMobileDeleteConfirmWithHierarchy
	| OpenMobileDeleteConfirmFromSelection

function isSelectionParams(
	params: OpenMobileDeleteConfirmParams,
): params is OpenMobileDeleteConfirmFromSelection {
	return "selectedKeys" in params
}

/**
 * Resolve display payload for the mobile delete sheet from either raw selection or pre-built hierarchy.
 */
function resolveDeleteConfirmConfig(
	params: OpenMobileDeleteConfirmParams,
): MobileDeleteConfirmResolvedConfig {
	if (isSelectionParams(params)) {
		const {
			attachments,
			selectedKeys,
			onConfirm,
			testIdPrefix,
			canvasWarning,
			canvasWarningContent,
		} = params
		return {
			selectedHierarchy: buildDeleteConfirmHierarchyFromAttachments(
				attachments,
				selectedKeys,
			),
			magicWarningVariant: resolveMagicDeleteWarningVariant(
				attachments,
				selectedKeys,
				getAttachmentKey,
			),
			canvasWarning: Boolean(canvasWarning),
			canvasWarningContent,
			onConfirm,
			testIdPrefix,
		}
	}

	return params
}

/**
 * Mobile delete confirmation: hierarchy list + `.magic` warnings only (no legacy text-only sheet).
 */
export function useMobileDeleteConfirmSheet() {
	const [config, setConfig] = useState<MobileDeleteConfirmResolvedConfig | null>(null)

	/** Open the delete sheet; accepts either attachments+keys or pre-built hierarchy. */
	const openDeleteConfirm = useMemoizedFn((params: OpenMobileDeleteConfirmParams) => {
		setConfig(resolveDeleteConfirmConfig(params))
	})

	/** Close and clear sheet state so the next open does not reuse stale hierarchy. */
	const closeDeleteConfirm = useMemoizedFn(() => {
		setConfig(null)
	})

	const deleteConfirmNode = (
		<FilesDeleteConfirmSheet
			visible={Boolean(config)}
			onClose={closeDeleteConfirm}
			onConfirm={async () => {
				if (!config) return
				await config.onConfirm()
				closeDeleteConfirm()
			}}
			selectedHierarchy={config?.selectedHierarchy ?? []}
			magicWarningVariant={config?.magicWarningVariant}
			canvasWarning={config?.canvasWarning}
			canvasWarningContent={config?.canvasWarningContent}
			testIdPrefix={config?.testIdPrefix}
		/>
	)

	return {
		openDeleteConfirm,
		closeDeleteConfirm,
		deleteConfirmNode,
	}
}
