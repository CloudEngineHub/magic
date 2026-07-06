import MagicSpin from "@/components/base/MagicSpin"
import { Avatar, Flex, Input, List, Select } from "antd"
import { useMemo, useRef, type UIEvent } from "react"
import { FlowRouteType, VectorKnowledge } from "@/types/flow"
import FlowEmptyImage from "@/assets/logos/empty-flow.png"
import { IconSearch } from "@tabler/icons-react"
import MagicButton from "@/components/base/MagicButton"
import { useTranslation } from "react-i18next"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { Knowledge } from "@/types/knowledge"
import UpdateKnowledgeModal from "@/pages/vectorKnowledge/components/UpdateInfoModal"
import useFlowList from "@/pages/flow/list/hooks/useFlowList"
import FlowCard from "@/pages/flow/components/FlowCard"
import { useStyles } from "@/pages/flow/list/styles"

export default function VectorKnowledgeList() {
	const { t: globalT } = useTranslation()
	const { t } = useTranslation("interface")
	const navigate = useNavigate()
	const { styles, cx } = useStyles()
	const flowType = FlowRouteType.VectorKnowledge
	const lastLoadMoreLengthRef = useRef(0)

	const {
		scrollRef,
		updateFlowEnable,
		getDropdownItems,
		keyword,
		setKeyword,
		vkSearchType,
		setVkSearchType,
		loading,
		flowList,
		title,
		currentFlow,
		updateFlowOrTool,
		addOrUpdateFlowOpen,
		handleCardClick,
		handleCloseAddOrUpdateFlow,
		loadMoreData,
		hasMore,
		total,
		deleteFlowModal,
	} = useFlowList({
		flowType,
	})

	const vkSearchTypeOptions = useMemo(() => {
		return [
			{
				label: globalT("common.all", { ns: "flow" }),
				value: VectorKnowledge.SearchType.All,
			},
			{
				label: globalT("common.enable", { ns: "flow" }),
				value: VectorKnowledge.SearchType.Enabled,
			},
			{
				label: globalT("common.disabled", { ns: "flow" }),
				value: VectorKnowledge.SearchType.Disabled,
			},
		]
	}, [globalT])

	function handleCreateKnowledge() {
		navigate({ name: RouteName.VectorKnowledgeCreate })
	}

	function handleListScroll(event: UIEvent<HTMLDivElement>) {
		if (loading || !hasMore) return

		const { scrollTop, clientHeight, scrollHeight } = event.currentTarget
		const distanceToBottom = scrollHeight - scrollTop - clientHeight
		if (distanceToBottom > 80) return

		// 同一批数据触底时只触发一次，避免滚动事件在请求返回前连续拉取下一页。
		if (lastLoadMoreLengthRef.current === flowList.length) return

		lastLoadMoreLengthRef.current = flowList.length
		loadMoreData()
	}

	return (
		<Flex className="h-full flex-col">
			<Flex align="center" justify="space-between" className={styles.top}>
				<div className={styles.leftTitle}>{`${title}（${total}）`}</div>
				<Flex align="center" gap={6}>
					<Select
						style={{ width: 180 }}
						options={vkSearchTypeOptions}
						value={vkSearchType}
						onChange={(value) => setVkSearchType(value)}
					/>
					<Input
						prefix={<IconSearch size={20} color="#b0b0b2" />}
						value={keyword}
						onChange={(event) => setKeyword(event.target.value)}
						placeholder={globalT("common.search", { ns: "flow" })}
					/>
					<MagicButton
						style={{ borderRadius: 8 }}
						type="primary"
						onClick={handleCreateKnowledge}
					>
						{t("common.createSomething", { ns: "flow", name: title })}
					</MagicButton>
				</Flex>
			</Flex>
			<div
				id="vectorKnowledgeScrollableDiv"
				ref={scrollRef}
				onScroll={handleListScroll}
				className={cx(styles.vectorKnowledgeScrollableDiv, {
					[styles.isEmptyList]: flowList.length === 0,
				})}
			>
				{!loading && flowList.length === 0 && (
					<Flex vertical gap={20} align="center">
						<Flex className={styles.flowEmptyImage} align="center" justify="center">
							<Avatar src={FlowEmptyImage} size={140} />
						</Flex>
						<div className={styles.emptyTips}>
							{t(`common.neverCreateByType.${flowType}`, { ns: "flow" })}
						</div>
						<MagicButton type="primary" onClick={handleCreateKnowledge}>
							{t("common.createSomething", { ns: "flow", name: title })}
						</MagicButton>
					</Flex>
				)}
				{flowList.length !== 0 && (
					<div className={styles.scrollWrapper}>
						<List
							grid={{ gutter: 8, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
							dataSource={flowList}
							loading={loading}
							renderItem={(item: Knowledge.KnowledgeItem) => {
								const dropdownItems = getDropdownItems(item)
								return (
									<List.Item className={styles.listItem}>
										<FlowCard
											flowType={flowType}
											selected={currentFlow?.id === item.id}
											data={item}
											lineCount={1}
											dropdownItems={dropdownItems}
											onCardClick={handleCardClick}
											updateEnable={updateFlowEnable}
										/>
									</List.Item>
								)
							}}
						/>
						<Flex align="center" justify="center" className={styles.emptyTips}>
							{hasMore ? (
								t("spin.loading")
							) : (
								<>————— {t("common.comeToTheEnd", { ns: "flow" })} —————</>
							)}
						</Flex>
					</div>
				)}
			</div>
			<UpdateKnowledgeModal
				title={title}
				details={currentFlow}
				open={addOrUpdateFlowOpen}
				onClose={handleCloseAddOrUpdateFlow}
				updateList={updateFlowOrTool}
			/>
			{deleteFlowModal}
		</Flex>
	)
}
