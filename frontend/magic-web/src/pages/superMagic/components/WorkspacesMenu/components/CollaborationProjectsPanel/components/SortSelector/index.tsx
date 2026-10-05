import { memo } from "react"
import { useTranslation } from "react-i18next"
import { IconArrowsSort, IconCheck, IconChevronDown } from "@tabler/icons-react"
import MagicIcon from "@/components/base/MagicIcon"
import MagicDropdown from "@/components/base/MagicDropdown"
import { type SortSelectorProps } from "../types"
import { SortType } from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem"

function SortSelectorComponent({
	value,
	onChange,
	includeWorkspaceOrder,
	compact,
}: SortSelectorProps) {
	const { t } = useTranslation("super")

	const getSortLabel = (sortValue: SortType) => {
		switch (sortValue) {
			case SortType.WORKSPACE_ORDER:
				return t("projectResources.workspaceOrder")
			case SortType.PROJECT_UPDATE_TIME:
				return compact
					? t("projectResources.updateTime")
					: t("workspace.sortByProjectUpdateTime")
			case SortType.MY_LAST_ACTIVE_TIME:
				return compact
					? t("projectResources.lastActiveTime")
					: t("workspace.sortByMyLastActiveTime")
			case SortType.PROJECT_CREATE_TIME:
				return compact
					? t("projectResources.createTime")
					: t("workspace.sortByProjectCreateTime")
			default:
				return t("workspace.sortByProjectUpdateTime")
		}
	}

	return (
		<MagicDropdown
			menu={{
				items: [
					...(includeWorkspaceOrder
						? [
								{
									key: SortType.WORKSPACE_ORDER,
									label: (
										<div className="flex items-center justify-between gap-1">
											{t("projectResources.workspaceOrder")}
											{value === SortType.WORKSPACE_ORDER && (
												<MagicIcon
													component={IconCheck}
													size={16}
													className="text-primary"
												/>
											)}
										</div>
									),
								},
							]
						: []),
					{
						key: SortType.PROJECT_UPDATE_TIME,
						label: (
							<div className="flex items-center justify-between gap-1">
								{t("workspace.sortByProjectUpdateTime")}
								{value === SortType.PROJECT_UPDATE_TIME && (
									<MagicIcon
										component={IconCheck}
										size={16}
										className="text-primary"
									/>
								)}
							</div>
						),
					},
					{
						key: SortType.MY_LAST_ACTIVE_TIME,
						label: (
							<div className="flex items-center justify-between gap-1">
								{t("workspace.sortByMyLastActiveTime")}
								{value === SortType.MY_LAST_ACTIVE_TIME && (
									<MagicIcon
										component={IconCheck}
										size={16}
										className="text-primary"
									/>
								)}
							</div>
						),
					},
					{
						key: SortType.PROJECT_CREATE_TIME,
						label: (
							<div className="flex items-center justify-between gap-1">
								{t("workspace.sortByProjectCreateTime")}
								{value === SortType.PROJECT_CREATE_TIME && (
									<MagicIcon
										component={IconCheck}
										size={16}
										className="text-primary"
									/>
								)}
							</div>
						),
					},
				],
				onClick: ({ key }) => onChange(key as SortType),
			}}
		>
			<div className="flex h-8 cursor-pointer items-center rounded-lg px-2.5 transition-all duration-200 hover:bg-fill">
				<div className="flex items-center gap-1">
					<MagicIcon component={IconArrowsSort} size={16} />
					{!compact && (
						<span className="text-xs font-normal leading-4 text-muted-foreground">
							{t("workspace.sort")}
						</span>
					)}
					<span className="text-xs font-normal leading-4 text-foreground">
						{getSortLabel(value)}
					</span>
					<MagicIcon component={IconChevronDown} size={14} />
				</div>
			</div>
		</MagicDropdown>
	)
}

export default memo(SortSelectorComponent)
