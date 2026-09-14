import { useEffect, useRef, useState, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { CircleAlert, CircleCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import "@xterm/xterm/css/xterm.css"
import { terminalTheme, useStyles } from "./style"

interface TerminalDisplayProps {
	command: string
	output?: string
	exitCode?: number | string
	className?: string
}

function TerminalDisplay({ command, output, exitCode, className }: TerminalDisplayProps) {
	const { styles, cx } = useStyles()
	const { t } = useTranslation("super")
	const hasExitCode = typeof exitCode === "number" && Number.isFinite(exitCode)
	const hasError = hasExitCode && exitCode !== 0
	const terminalRef = useRef<HTMLDivElement>(null)
	const terminalInstanceRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const resizeTimeoutRef = useRef<number | null>(null)
	const isDisposedRef = useRef(false)
	const [isTerminalReady, setIsTerminalReady] = useState(false)

	// Fit terminal with proper error handling and timing
	const fitTerminal = useCallback(() => {
		const fitAddon = fitAddonRef.current
		const termInstance = terminalInstanceRef.current

		if (!fitAddon || !termInstance || isDisposedRef.current) {
			return
		}

		try {
			// Ensure container has dimensions before fitting
			const container = terminalRef.current
			if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
				fitAddon.fit()
				return true
			}
		} catch (error) {
			console.warn("Failed to fit terminal:", error)
		}
		return false
	}, [])

	// 初始化 Terminal 实例的 useEffect
	useEffect(() => {
		if (!terminalRef.current) return

		isDisposedRef.current = false
		setIsTerminalReady(false)

		const termInstance = new Terminal({
			disableStdin: true,
			fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
			fontSize: 14,
			lineHeight: 1.6,
			theme: terminalTheme,
		})

		const fitAddon = new FitAddon()
		termInstance.loadAddon(fitAddon)
		termInstance.open(terminalRef.current)

		// Use requestAnimationFrame to ensure proper timing for fit
		const scheduleInitialFit = () => {
			requestAnimationFrame(() => {
				if (fitAddon && termInstance && !isDisposedRef.current) {
					const success = fitTerminal()
					if (success) {
						setIsTerminalReady(true)
					} else {
						// Retry if container dimensions are not ready yet
						setTimeout(scheduleInitialFit, 10)
					}
				}
			})
		}

		scheduleInitialFit()

		// 设置 ResizeObserver
		const observer = new ResizeObserver(() => {
			// Debounce resize events
			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current)
			}
			resizeTimeoutRef.current = window.setTimeout(() => {
				fitTerminal()
			}, 50) as number
		})

		if (terminalRef.current) {
			observer.observe(terminalRef.current)
		}

		// 保存引用
		terminalInstanceRef.current = termInstance
		fitAddonRef.current = fitAddon
		resizeObserverRef.current = observer

		return () => {
			isDisposedRef.current = true
			setIsTerminalReady(false)

			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current)
			}

			if (observer) {
				observer.disconnect()
			}

			if (termInstance) {
				try {
					termInstance.dispose()
				} catch (error) {
					console.warn("Failed to dispose terminal:", error)
				}
			}
		}
	}, [fitTerminal])

	// 写入命令和输出的 useEffect - 只有在 Terminal 准备就绪时才执行
	useEffect(() => {
		const termInstance = terminalInstanceRef.current

		if (!termInstance || isDisposedRef.current || !isTerminalReady) {
			return
		}

		try {
			// 清空终端内容
			termInstance.clear()

			// ANSI 颜色代码
			const colors = {
				green: "\x1b[32m", // 绿色 - 用于命令提示符
				brightBlack: "\x1b[90m", // 亮黑色/灰色 - 用于注释
				blue: "\x1b[34m", // 蓝色 - 用于命令
				reset: "\x1b[0m", // 重置颜色
			}

			// 处理多行命令
			const commandLines = command.split("\n")
			commandLines.forEach((line, index) => {
				if (line.trim()) {
					// 对于非空行，如果是注释则直接显示，否则加上 $ 前缀
					if (line.trim().startsWith("#")) {
						// 注释用亮黑色（灰色）显示
						termInstance.writeln(`${colors.brightBlack}${line}${colors.reset}`)
					} else {
						// 命令提示符用绿色，命令本身用蓝色
						termInstance.writeln(
							`${colors.green}$${colors.reset} ${colors.blue}${line}${colors.reset}`,
						)
					}
				} else if (index < commandLines.length - 1) {
					// 保留空行格式
					termInstance.writeln("")
				}
			})

			termInstance.write("\r\n")
			if (output) {
				// 输出内容用默认前景色（浅白色）显示
				const processedOutput = output.replace(/\n/g, "\r\n")
				termInstance.writeln(processedOutput)
			}

			// Re-fit after content changes
			setTimeout(() => {
				fitTerminal()
				// 滚动到顶部，让用户看到命令行
				termInstance.scrollToTop()
			}, 10)
		} catch (error) {
			console.warn("Failed to write to terminal:", error)
		}
	}, [command, output, exitCode, isTerminalReady, fitTerminal])

	return (
		<div className={cx(styles.terminalDisplay, className)}>
			<div className={styles.terminalBody}>
				<div className={styles.terminalMount} ref={terminalRef} />
			</div>
			<div className={cx(styles.footer, hasError && styles.error)} role="status">
				{hasExitCode && (
					<>
						{/* Exit code 根据结果显示不同颜色 */}
						{/* 这里只解释本次返回；后台命令仍运行时，工具也可能正常返回。 */}
						<span className={styles.status}>
							{hasError ? (
								<CircleAlert size={16} aria-hidden />
							) : (
								<CircleCheck size={16} aria-hidden />
							)}
							{hasError
								? t("terminal.returnedWithError")
								: t("terminal.returnedNormally")}
						</span>
						<span className={styles.exitCode}>
							{t("terminal.exitCode")}
							<span className={styles.exitCodeValue} data-terminal-exit-code>
								{exitCode}
							</span>
						</span>
					</>
				)}
			</div>
		</div>
	)
}

export default TerminalDisplay
