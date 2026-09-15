import type { ReactNode } from "react"
import { FolderTree, MoreHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import { MagicDropdown } from "@/components/base/MagicDropdown"
import { cn } from "@/utils/cn"

interface HeaderTrailingActionProps {
	children: ReactNode
}

export default function HeaderTrailingAction({ children }: HeaderTrailingActionProps) {
	// 通用尾部内容保留尺寸；文件管理器单独提供动作，宽度不足时可移入更多菜单。
	return <div className="flex shrink-0 items-center gap-1">{children}</div>
}

export function FileManagerAction({
	onClick,
	overflow = false,
}: {
	onClick: () => void
	overflow?: boolean
}) {
	const { t } = useTranslation("super")
	return (
		<>
			<div
				className={cn(
					"flex shrink-0",
					overflow && "pointer-events-none invisible absolute",
				)}
				aria-hidden={overflow || undefined}
			>
				<MagicTooltip title={t("userSpace.openManager")}>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0"
						aria-label={t("userSpace.openManager")}
						onClick={onClick}
					>
						<FolderTree size={16} />
					</Button>
				</MagicTooltip>
			</div>
			{overflow && (
				<div data-overflow-trigger className="flex shrink-0">
					<MagicDropdown
						trigger={["click"]}
						menu={{
							items: [
								{
									key: "file-manager",
									label: t("userSpace.openManager"),
									icon: <FolderTree size={16} />,
									onClick,
								},
							],
						}}
					>
						<span>
							<MagicTooltip title={t("topicFiles.moreActions")}>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 shrink-0"
									aria-label={t("topicFiles.moreActions")}
								>
									<MoreHorizontal size={16} />
								</Button>
							</MagicTooltip>
						</span>
					</MagicDropdown>
				</div>
			)}
		</>
	)
}
