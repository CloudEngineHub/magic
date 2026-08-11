import { memo, useMemo, useState, type ReactNode } from "react"
import { Button, Divider, Flex, Popover, Typography } from "antd"
import { createStyles } from "antd-style"
import { IconBuilding, IconChevronRight, IconUsers } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { StatusTag } from "@admin-components"
import type { AiManage } from "@admin/types/aiManage"

const useStyles = createStyles(({ token }) => ({
	cell: {
		minWidth: 150,
		maxWidth: 220,
	},
	metrics: {
		color: token.magicColorUsages.text[2],
		fontSize: 12,
		lineHeight: "18px",
	},
	metric: {
		display: "inline-flex",
		alignItems: "center",
		gap: 3,
		whiteSpace: "nowrap",
	},
	viewButton: {
		padding: 0,
		height: 20,
		fontSize: 12,
		justifyContent: "flex-start",
	},
	muted: {
		color: token.magicColorUsages.text[3],
		fontSize: 12,
	},
	popover: {
		width: 300,
	},
	popoverHeader: {
		fontSize: 13,
	},
	sectionTitle: {
		color: token.magicColorUsages.text[2],
		fontSize: 12,
		fontWeight: 600,
	},
	list: {
		maxHeight: 220,
		overflowY: "auto",
		paddingRight: 4,
		contentVisibility: "auto",
	},
	listItem: {
		minWidth: 0,
		fontSize: 12,
		lineHeight: "20px",
	},
	itemName: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
}))

interface PublishTargetCellProps {
	type?: string
	typeLabel?: string
	value?: AiManage.PublishTargetValue | null
}

interface PublishTargetGroupProps {
	label: string
	icon: ReactNode
	items: AiManage.PublishTargetItem[]
}

function PublishTargetGroup({ label, icon, items }: PublishTargetGroupProps) {
	const { styles } = useStyles()
	const getItemLabel = (item: AiManage.PublishTargetItem) =>
		item.name || item.nickname || item.id || "-"

	return (
		<Flex vertical gap={4}>
			<Flex align="center" gap={5} className={styles.sectionTitle}>
				{icon}
				<span>{label}</span>
				<span>({items.length})</span>
			</Flex>
			<div className={styles.list}>
				<Flex vertical gap={2}>
					{items.map((item, index) => (
						<Flex
							key={item.id || `${getItemLabel(item)}-${index}`}
							align="center"
							gap={6}
							className={styles.listItem}
						>
							<span className={styles.itemName} title={getItemLabel(item)}>
								{getItemLabel(item)}
							</span>
						</Flex>
					))}
				</Flex>
			</div>
		</Flex>
	)
}

function PublishTargetDetails({ value }: { value: AiManage.PublishTargetValue }) {
	const { t } = useTranslation("admin/common")
	const { styles } = useStyles()
	const users = value.users ?? []
	const departments = value.departments ?? []

	return (
		<Flex vertical gap={10} className={styles.popover}>
			<Typography.Text strong className={styles.popoverHeader}>
				{t("publishTarget.details")}
			</Typography.Text>
			{users.length > 0 && (
				<PublishTargetGroup
					label={t("publishTarget.members")}
					icon={<IconUsers size={14} stroke={1.8} />}
					items={users}
				/>
			)}
			{users.length > 0 && departments.length > 0 && <Divider style={{ margin: 0 }} />}
			{departments.length > 0 && (
				<PublishTargetGroup
					label={t("publishTarget.departments")}
					icon={<IconBuilding size={14} stroke={1.8} />}
					items={departments}
				/>
			)}
		</Flex>
	)
}

function PublishTargetCell({ type, typeLabel, value }: PublishTargetCellProps) {
	const { t } = useTranslation("admin/common")
	const { styles } = useStyles()
	const [open, setOpen] = useState(false)
	const users = value?.users ?? []
	const departments = value?.departments ?? []
	const hasDetails = users.length > 0 || departments.length > 0

	const metrics = useMemo(
		() => [
			users.length > 0 && (
				<span className={styles.metric} key="users">
					<IconUsers size={13} stroke={1.8} />
					{t("publishTarget.memberCount", { count: users.length })}
				</span>
			),
			departments.length > 0 && (
				<span className={styles.metric} key="departments">
					<IconBuilding size={13} stroke={1.8} />
					{t("publishTarget.departmentCount", { count: departments.length })}
				</span>
			),
		],
		[departments.length, styles.metric, t, users.length],
	)

	return (
		<Flex vertical gap={4} className={styles.cell}>
			<StatusTag color={type === "MEMBER" ? "blue" : "default"} bordered={false}>
				{typeLabel || type || "-"}
			</StatusTag>
			{hasDetails ? (
				<>
					<Flex gap={8} wrap="wrap" className={styles.metrics}>
						{metrics}
					</Flex>
					<Popover
						trigger="click"
						placement="bottomLeft"
						open={open}
						onOpenChange={setOpen}
						getPopupContainer={() => document.body}
						content={open && value ? <PublishTargetDetails value={value} /> : null}
					>
						<Button
							type="link"
							size="small"
							className={styles.viewButton}
							onClick={(event) => {
								event.stopPropagation()
								setOpen(true)
							}}
						>
							{t("publishTarget.view")}
							<IconChevronRight size={13} stroke={1.8} />
						</Button>
					</Popover>
				</>
			) : type === "MEMBER" ? (
				<span className={styles.muted}>{t("publishTarget.empty")}</span>
			) : null}
		</Flex>
	)
}

export default memo(PublishTargetCell)
