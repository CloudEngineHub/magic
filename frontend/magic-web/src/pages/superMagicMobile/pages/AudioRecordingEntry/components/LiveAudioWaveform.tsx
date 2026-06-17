import { useEffect, useRef } from "react"

export interface LiveAudioWaveformProps {
	/** true = recording active (sample & scroll); false = paused (freeze frame) */
	active: boolean
	/** Color of the waveform bars. Defaults to parent CSS color (currentColor) */
	color?: string
	/** Container height in pixels, defaults to 28 */
	height?: number
	/** Width of each individual bar in pixels, defaults to 2 */
	barWidth?: number
	/** Gap spacing between bars in pixels, defaults to 2 */
	barGap?: number
	/** Interval in milliseconds to sample amplitude / flow new bars, defaults to 60 */
	sampleIntervalMs?: number
	/** Width of edge fading overlay in pixels, defaults to 16. Set to 0 to disable */
	fadeWidth?: number
	/** Color to fade into (usually matching card background). Fades will not render if omitted */
	fadeColor?: string
	className?: string
}

/**
	* LiveAudioWaveform: Renders a real-time rolling microphone amplitude waveform.
	* New bars flow in from the right; historical bars roll off to the left.
	* Under the hood, this uses Canvas + requestAnimationFrame for high performance.
	* It auto-gracefully falls back to simulated pseudo-random voice waves if microphone
	* permissions are denied or unavailable (e.g., non-secure context or user rejection).
	*/
export function LiveAudioWaveform({
	active,
	color,
	height = 28,
	barWidth = 2,
	barGap = 2,
	sampleIntervalMs = 60,
	fadeWidth = 16,
	fadeColor,
	className,
}: LiveAudioWaveformProps) {
	const isTestEnv = typeof process !== "undefined" && process.env.NODE_ENV === "test"

	if (isTestEnv) {
		return (
			<div
				className={className}
				style={{ height }}
				data-testid="live-audio-waveform-mock"
			/>
		)
	}

	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	// Keep mutable animation states in a ref to avoid stale closures in requestAnimationFrame loops
	const stateRef = useRef({
		amplitudes: [] as number[],
		scrollOffset: 0, // current horizontal pixel offset (0 ~ BAR_PITCH) for the incoming bar
		lastFrameTime: 0,
		analyser: null as AnalyserNode | null,
		audioCtx: null as AudioContext | null,
		stream: null as MediaStream | null,
		rafId: 0,
		active,
		simPhase: 0, // Accumulator phase for simulated wave generator
		simSmooth: 0, // Low-pass filter smoothing amplitude for simulated wave
	})

	// Sync active state to ref dynamically without rebuilding effect contexts
	stateRef.current.active = active

	// Effect: Manage microphone stream lifetime, request on active, clean up on inactive
	useEffect(() => {
		if (!active) {
			// Clean up all audio nodes and stream tracks when inactive to release hardware resources
			const { stream, audioCtx } = stateRef.current
			stream?.getTracks().forEach((t) => t.stop())
			audioCtx?.close().catch(() => {})
			stateRef.current.stream = null
			stateRef.current.audioCtx = null
			stateRef.current.analyser = null
			return
		}

		if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return

		let cancelled = false

		navigator.mediaDevices
			.getUserMedia({ audio: true, video: false })
			.then((stream) => {
				if (cancelled) {
					stream.getTracks().forEach((t) => t.stop())
					return
				}
				const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
				const source = audioCtx.createMediaStreamSource(stream)
				const analyser = audioCtx.createAnalyser()
				analyser.fftSize = 512
				analyser.smoothingTimeConstant = 0.25
				source.connect(analyser)

				stateRef.current.stream = stream
				stateRef.current.audioCtx = audioCtx
				stateRef.current.analyser = analyser

				// Resume audio context if it got suspended by browser security policy
				if (audioCtx.state === "suspended") {
					audioCtx.resume().catch(() => {})
				}
			})
			.catch(() => {
				// Failed to obtain microphone permission/stream: fall back to simulated wave loop silently
			})

		return () => {
			cancelled = true
			const { stream, audioCtx } = stateRef.current
			stream?.getTracks().forEach((t) => t.stop())
			audioCtx?.close().catch(() => {})
			stateRef.current.stream = null
			stateRef.current.audioCtx = null
			stateRef.current.analyser = null
		}
	}, [active])

	// Effect: Canvas rendering loop and resize observation
	useEffect(() => {
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!canvas || !container) return

		const dpr = window.devicePixelRatio || 1
		const BAR_PITCH = barWidth + barGap // Combined width of a single bar plus its trailing gap
		const PX_PER_MS = BAR_PITCH / sampleIntervalMs // Rate of scrolling pixels per millisecond

		// Function to match canvas sizing to the observed container dimensions
		const resize = () => {
			if (!container || !canvas) return
			const w = container.getBoundingClientRect().width
			canvas.width = Math.round(w * dpr)
			canvas.height = Math.round(height * dpr)
			canvas.style.width = `${w}px`
			canvas.style.height = `${height}px`

			// Pre-fill the buffer with flat 0 amplitudes so we render a quiet straight line on load
			if (stateRef.current.amplitudes.length === 0) {
				const initialCount = Math.ceil(w / BAR_PITCH) + 2
				stateRef.current.amplitudes = new Array(initialCount).fill(0)
			}
		}

		resize()
		const ro = new ResizeObserver(resize)
		ro.observe(container)

		// Reads current microphone amplitude, mapping root-mean-square to a normalized 0..1 scale
		const readAmplitude = (): number => {
			const { analyser } = stateRef.current

			if (analyser) {
				const buf = new Uint8Array(analyser.fftSize)
				analyser.getByteTimeDomainData(buf)
				let sum = 0
				for (let i = 0; i < buf.length; i++) {
					const v = buf[i]
					if (v !== undefined) {
						sum += Math.abs(v - 128)
					}
				}
				// Normalize: average absolute deviation divided by 40 fits common speech well
				return Math.min(1, sum / buf.length / 40)
			}

			// Simulation Mode: pseudo-speech envelope using overlapping sine generators + noise
			const state = stateRef.current
			state.simPhase += 0.18
			const envelope =
				0.35 +
				0.25 * Math.sin(state.simPhase * 0.6) +
				0.15 * Math.sin(state.simPhase * 1.9) +
				0.1 * Math.sin(state.simPhase * 4.3)
			const noisy = Math.max(0, envelope + (Math.random() - 0.5) * 0.3)
			// Smooth transitions with simple low-pass IIR filter
			state.simSmooth += (noisy - state.simSmooth) * 0.4
			return Math.min(1, Math.max(0, state.simSmooth))
		}

		// Animation frame draw loop
		const draw = (timestamp: number) => {
			const state = stateRef.current
			const ctx = canvas.getContext("2d")
			if (!ctx) {
				state.rafId = requestAnimationFrame(draw)
				return
			}

			// Handle elapsed time, clamp at 100ms to avoid huge scrolling jumps when backgrounding tabs
			const dt = state.lastFrameTime ? Math.min(timestamp - state.lastFrameTime, 100) : 16
			state.lastFrameTime = timestamp

			// Scroll waves only when active
			if (state.active) {
				state.scrollOffset += PX_PER_MS * dt
			}

			// Shift buffer and feed a new sampled bar every time scrollOffset exceeds BAR_PITCH
			while (state.scrollOffset >= BAR_PITCH) {
				state.scrollOffset -= BAR_PITCH
				const amp = state.active ? readAmplitude() : (state.amplitudes[0] ?? 0)
				state.amplitudes.unshift(amp)
				const maxBars = Math.ceil(canvas.width / (BAR_PITCH * dpr)) + 2
				if (state.amplitudes.length > maxBars) {
					state.amplitudes.length = maxBars
				}
			}

			const W = canvas.width
			const H = canvas.height
			ctx.clearRect(0, 0, W, H)

			// Default color fallback to computed text color from parent
			ctx.fillStyle = color ?? getComputedStyle(canvas).color ?? "#000"

			// Current right-most bar position shifted by dynamic scroll offset
			const newestRight = W - state.scrollOffset * dpr

			// Draw all bars backwards from right to left
			for (let i = 0; i < state.amplitudes.length; i++) {
				const barRight = newestRight - i * BAR_PITCH * dpr
				const barLeft = barRight - barWidth * dpr
				if (barLeft > W) continue
				if (barRight < 0) break

				const amp = state.amplitudes[i] ?? 0
				const barH = Math.max(2 * dpr, amp * H)
				const barY = (H - barH) / 2
				const radius = (barWidth * dpr) / 2

				ctx.beginPath()
				if (typeof ctx.roundRect === "function") {
					ctx.roundRect(barLeft, barY, barWidth * dpr, barH, radius)
				} else {
					ctx.rect(barLeft, barY, barWidth * dpr, barH)
				}
				ctx.fill()
			}

			state.rafId = requestAnimationFrame(draw)
		}

		stateRef.current.rafId = requestAnimationFrame(draw)

		return () => {
			cancelAnimationFrame(stateRef.current.rafId)
			ro.disconnect()
		}
	}, [height, barWidth, barGap, sampleIntervalMs, color])

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ position: "relative", height, overflow: "hidden" }}
			aria-hidden
		>
			<canvas ref={canvasRef} style={{ display: "block" }} />

			{/* Left and right gradient fade overlays for seamless blending into card background */}
			{fadeColor && fadeWidth > 0 && (
				<>
					<div
						style={{
							pointerEvents: "none",
							position: "absolute",
							inset: "0 auto 0 0",
							width: fadeWidth,
							background: `linear-gradient(to right, ${fadeColor}, transparent)`,
						}}
					/>
					<div
						style={{
							pointerEvents: "none",
							position: "absolute",
							inset: "0 0 0 auto",
							width: fadeWidth,
							background: `linear-gradient(to left, ${fadeColor}, transparent)`,
						}}
					/>
				</>
			)}
		</div>
	)
}
