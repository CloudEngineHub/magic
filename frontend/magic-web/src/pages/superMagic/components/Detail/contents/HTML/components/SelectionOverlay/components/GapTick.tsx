import type { GapAxis } from "../utils/gapHandleLayout"

export function GapTick({ axis }: { axis: GapAxis }) {
	if (axis === "column") {
		return (
			<span data-gap-tick="column" className="pointer-events-none h-full w-0.5 bg-primary" />
		)
	}
	return <span data-gap-tick="row" className="pointer-events-none h-0.5 w-full bg-primary" />
}
