import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StaticPeakWaveformStrip } from "../StaticPeakWaveformStrip"

describe("StaticPeakWaveformStrip", () => {
	it("renders gray and played layers for simulated peaks", () => {
		const { container } = render(
			<StaticPeakWaveformStrip
				peakNorms={[0.2, 0.8, 0.5]}
				maxBarPx={20}
				currentSec={50}
				durationSec={100}
				paused={false}
			/>,
		)

		expect(container.querySelectorAll(".bg-muted-foreground\\/45").length).toBeGreaterThan(0)
		expect(container.querySelectorAll(".bg-foreground").length).toBeGreaterThan(0)
	})
})
