import { memo } from "react"
import { Button, Empty, Flex, InputNumber, Switch, Tag, Typography } from "antd"
import { useTranslation } from "react-i18next"
import { IconPlus } from "@tabler/icons-react"
import { MagicButton } from "@admin-components"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { isSystemSlidesTemplateTagGroup, resolveSlidesTemplateTagName } from "../utils"

interface SlidesTemplateTagGroupPanelProps {
	groups: SlidesTemplate.TagItem[]
	selectedGroupId: string | null
	hasEditRight: boolean
	onSelect: (groupId: string | null) => void
	onCreate: () => void
	onEdit: (group: SlidesTemplate.TagItem) => void
	onDelete: (group: SlidesTemplate.TagItem) => void
	statusLoadingIds: ReadonlySet<string>
	sortLoadingIds: ReadonlySet<string>
	onStatusChange: (group: SlidesTemplate.TagItem, checked: boolean) => void
	onSortChange: (group: SlidesTemplate.TagItem, sort: number | null) => void
}

export const SlidesTemplateTagGroupPanel = memo(
	({
		groups,
		selectedGroupId,
		hasEditRight,
		onSelect,
		onCreate,
		onEdit,
		onDelete,
		statusLoadingIds,
		sortLoadingIds,
		onStatusChange,
		onSortChange,
	}: SlidesTemplateTagGroupPanelProps) => {
		const { t } = useTranslation("admin/common")

		return (
			<Flex
				vertical
				style={{
					width: 320,
					flex: "0 0 320px",
					borderRight: "1px solid #f0f0f0",
					paddingRight: 16,
				}}
			>
				<Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
					<Typography.Text strong>{t("slidesTemplate.tag.groupsTitle")}</Typography.Text>
					<MagicButton
						type="link"
						icon={<IconPlus size={15} />}
						disabled={!hasEditRight}
						onClick={onCreate}
					>
						{t("slidesTemplate.tag.addGroupButton")}
					</MagicButton>
				</Flex>
				<div
					role="button"
					tabIndex={0}
					style={{
						borderRadius: 6,
						background: selectedGroupId === null ? "#f0f5ff" : "transparent",
						cursor: "pointer",
						padding: "10px",
						marginBottom: 4,
					}}
					onClick={() => onSelect(null)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") onSelect(null)
					}}
				>
					<Typography.Text strong={selectedGroupId === null}>
						{t("slidesTemplate.tag.allOption")}
					</Typography.Text>
				</div>
				<Flex vertical gap={4} style={{ overflowY: "auto", maxHeight: 500 }}>
					{groups.map((group) => {
						const selected = group.id === selectedGroupId
						const isSystemGroup = isSystemSlidesTemplateTagGroup(group)
						const statusLoading = statusLoadingIds.has(group.id)
						const sortLoading = sortLoadingIds.has(group.id)
						return (
							<div
								key={group.id}
								role="button"
								tabIndex={0}
								style={{
									borderRadius: 6,
									background: selected ? "#f0f5ff" : "transparent",
									cursor: "pointer",
									padding: "8px 10px",
								}}
								onClick={() => onSelect(group.id)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ")
										onSelect(group.id)
								}}
							>
								<Flex align="center" justify="space-between" gap={8}>
									<Flex vertical style={{ minWidth: 0 }}>
										<Flex align="center" gap={4}>
											<Typography.Text
												ellipsis
												strong={selected}
												style={{ maxWidth: 180 }}
											>
												{resolveSlidesTemplateTagName(group)}
											</Typography.Text>
											{isSystemGroup ? (
												<Tag color="blue">
													{t("slidesTemplate.tag.systemBuiltIn")}
												</Tag>
											) : null}
										</Flex>
										<Typography.Text
											type="secondary"
											ellipsis
											style={{ fontSize: 12, maxWidth: 220 }}
										>
											{group.code}
										</Typography.Text>
									</Flex>
									<Flex
										gap={6}
										onClick={(event) => event.stopPropagation()}
										onKeyDown={(event) => event.stopPropagation()}
									>
										<Button
											type="link"
											size="small"
											style={{ padding: 0 }}
											disabled={!hasEditRight}
											onClick={() => onEdit(group)}
										>
											{t("button.edit")}
										</Button>
										{!isSystemGroup ? (
											<Button
												type="link"
												danger
												size="small"
												style={{ padding: 0 }}
												disabled={!hasEditRight}
												onClick={() => onDelete(group)}
											>
												{t("button.delete")}
											</Button>
										) : null}
									</Flex>
								</Flex>
								<Flex
									align="center"
									gap={12}
									style={{ marginTop: 8 }}
									onClick={(event) => event.stopPropagation()}
									onKeyDown={(event) => event.stopPropagation()}
								>
									<Flex align="center" gap={6}>
										<Typography.Text type="secondary" style={{ fontSize: 12 }}>
											{t("slidesTemplate.tag.fields.enabled")}
										</Typography.Text>
										<Switch
											size="small"
											checked={
												group.status === SlidesTemplate.StatusMap.enabled
											}
											loading={statusLoading}
											disabled={!hasEditRight || statusLoading}
											onChange={(checked) => onStatusChange(group, checked)}
										/>
									</Flex>
									<Flex align="center" gap={6}>
										<Typography.Text type="secondary" style={{ fontSize: 12 }}>
											{t("slidesTemplate.tag.fields.sort")}
										</Typography.Text>
										<InputNumber
											key={`${group.id}-${group.sort}`}
											size="small"
											controls={false}
											defaultValue={group.sort}
											style={{ width: 76 }}
											disabled={!hasEditRight || sortLoading}
											onBlur={(event) =>
												onSortChange(group, Number(event.target.value || 0))
											}
											onPressEnter={(event) => event.currentTarget.blur()}
										/>
									</Flex>
								</Flex>
							</div>
						)
					})}
					{groups.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
				</Flex>
			</Flex>
		)
	},
)
