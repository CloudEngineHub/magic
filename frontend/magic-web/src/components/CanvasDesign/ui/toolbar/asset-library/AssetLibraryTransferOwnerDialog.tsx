import { AssetsApi, type AssetItem } from "@/apis"
import MemberDepartmentSelector from "@/components/business/MemberDepartmentSelector"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import type { TFunction } from "../../../public/i18n-types"

interface AssetLibraryTransferOwnerDialogProps {
	asset: AssetItem | null
	t: TFunction
	onClose: () => void
	onTransferred: () => void
}

function keepSingleMember(values: TreeNode[]): TreeNode[] {
	for (let index = values.length - 1; index >= 0; index -= 1) {
		if (values[index]?.dataType === NodeType.User) return [values[index]]
	}
	return []
}

export function AssetLibraryTransferOwnerDialog({
	asset,
	t,
	onClose,
	onTransferred,
}: AssetLibraryTransferOwnerDialogProps) {
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [selectedMember, setSelectedMember] = useState<TreeNode | null>(null)
	const [transferring, setTransferring] = useState(false)
	const currentOwnerId = asset?.owner_uid?.trim() || asset?.owner.id || ""
	const disabledValues: TreeNode[] = currentOwnerId
		? [
				{
					id: currentOwnerId,
					name: asset?.owner.name || currentOwnerId,
					dataType: NodeType.User,
				} as TreeNode,
			]
		: []

	const handleClose = () => {
		if (transferring) return
		setSelectedMember(null)
		setSelectorOpen(false)
		onClose()
	}

	const handleTransfer = async () => {
		if (!asset || transferring) return
		const ownerUid =
			(selectedMember as (TreeNode & { user_id?: string }) | null)?.user_id ||
			selectedMember?.id
		if (!ownerUid || selectedMember?.dataType !== NodeType.User) {
			toast.error(t("assets.transferMemberRequired", "请选择一名成员"))
			return
		}
		setTransferring(true)
		try {
			await AssetsApi.transferAssetOwner({
				asset_ids: [asset.asset_id],
				owner_uid: ownerUid,
			})
			toast.success(t("assets.transferSuccess", "素材归属人已转移"))
			setSelectedMember(null)
			onTransferred()
			onClose()
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("assets.transferFailed", "转移归属人失败，请重试"),
			)
		} finally {
			setTransferring(false)
		}
	}

	return (
		<>
			<Dialog
				open={Boolean(asset)}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) handleClose()
				}}
			>
				<DialogContent
					className="max-w-[560px] gap-0 p-0"
					onPointerDownOutside={(event) => {
						if (selectorOpen) event.preventDefault()
					}}
					onInteractOutside={(event) => {
						if (selectorOpen) event.preventDefault()
					}}
					onFocusOutside={(event) => {
						if (selectorOpen) event.preventDefault()
					}}
					onEscapeKeyDown={(event) => {
						if (selectorOpen) event.preventDefault()
					}}
				>
					<DialogHeader className="border-b px-5 py-4 pr-12 text-left">
						<DialogTitle>{t("assets.transferTitle", "转移素材归属人")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 px-5 py-5 text-sm">
						<p>
							<span className="text-muted-foreground">
								{t("assets.transferCurrentOwner", "当前归属人")}：
							</span>
							{asset?.owner.name || t("assets.unknownOwner", "未知归属人")}
						</p>
						<p>
							<span className="text-muted-foreground">
								{t("assets.transferSelectedAsset", "已选择素材")}：
							</span>
							{asset?.name}
						</p>
						<div className="space-y-2">
							<div className="font-medium">
								{t("assets.transferTarget", "目标归属人")}
							</div>
							<Button
								type="button"
								variant="outline"
								className="w-full justify-start font-normal"
								onClick={() => setSelectorOpen(true)}
							>
								{selectedMember?.name ||
									t("assets.transferSelectMember", "选择成员")}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							{t(
								"assets.transferHint",
								"转移后，当前归属人将不再拥有该素材的编辑和管理权限。",
							)}
						</p>
					</div>
					<DialogFooter className="border-t px-5 py-3">
						<Button type="button" variant="outline" onClick={handleClose}>
							{t("common.cancel", "取消")}
						</Button>
						<Button
							type="button"
							onClick={() => void handleTransfer()}
							disabled={transferring}
						>
							{transferring ? (
								<Loader2
									className="mr-1.5 size-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							{t("assets.transferAction", "转移")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<MemberDepartmentSelector
				open={selectorOpen}
				title={t("assets.transferSelectMember", "选择成员")}
				filterAgent
				maxCount={1}
				disabledValues={disabledValues}
				selectedValues={selectedMember ? [selectedMember] : []}
				onSelectChange={(values) => {
					const [member] = keepSingleMember(values as TreeNode[])
					setSelectedMember(member ?? null)
				}}
				onOk={(values) => {
					const [member] = keepSingleMember(values as TreeNode[])
					setSelectedMember(member ?? null)
					setSelectorOpen(false)
				}}
				onCancel={() => setSelectorOpen(false)}
				zIndex={1600}
			/>
		</>
	)
}
