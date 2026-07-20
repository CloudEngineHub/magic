import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import { Badge } from "@/components/shadcn-ui/badge"

interface PlanDataModelFieldsProps {
	fields: string[]
}

function PlanDataModelFields({ fields }: PlanDataModelFieldsProps) {
	if (fields.length === 0) return null

	return (
		<HeadlessHorizontalScroll
			className="mt-2 rounded-md"
			scrollContainerClassName="overscroll-x-contain"
			scrollContainerProps={{
				"data-testid": "plan-data-model-fields-scroll",
			}}
			renderLeftControl={() => null}
			renderRightControl={() => null}
		>
			<div
				className="flex min-w-max flex-nowrap gap-1.5"
				data-testid="plan-data-model-fields-rail"
			>
				{fields.map((field) => (
					<Badge
						key={field}
						variant="secondary"
						className="shrink-0 whitespace-nowrap rounded-md font-normal"
					>
						{field}
					</Badge>
				))}
			</div>
		</HeadlessHorizontalScroll>
	)
}

export default PlanDataModelFields
