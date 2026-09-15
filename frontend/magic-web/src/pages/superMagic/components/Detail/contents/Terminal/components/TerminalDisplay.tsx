import { useMemo } from "react"
import { CircleAlert, CircleCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useStyles } from "./style"
import { formatTerminalTranscript } from "./terminal-buffer"
import { TerminalCommand } from "./TerminalCommand"
import { TerminalOutput } from "./TerminalOutput"

interface TerminalDisplayProps {
	command: string
	output?: string
	exitCode?: number | string
	className?: string
	showControls?: boolean
	recordKey?: string
	action?: string
	remark?: string
}

function TerminalDisplay({
	command,
	output = "",
	exitCode,
	className,
	showControls = false,
	recordKey = command,
	action,
	remark,
}: TerminalDisplayProps) {
	const { styles, cx } = useStyles()
	const { t } = useTranslation("super")
	const hasExitCode = typeof exitCode === "number" && Number.isFinite(exitCode)
	const hasError = hasExitCode && exitCode !== 0
	// 详情分开呈现命令与输出；消息内嵌预览沿用完整终端记录和原有高度约束。
	const content = useMemo(
		() => (showControls ? output : formatTerminalTranscript(command, output)),
		[command, output, showControls],
	)

	// 同级命令区与输出区必须使用不同 key，切换记录时才能完整卸载旧内容。
	return (
		<div className={cx(styles.terminalDisplay, showControls && styles.detailView, className)}>
			{showControls && (
				<TerminalCommand
					key={`command:${recordKey}`}
					command={command}
					action={action}
					remark={remark}
				/>
			)}
			<TerminalOutput
				key={`output:${recordKey}`}
				content={content}
				recordKey={recordKey}
				showControls={showControls}
			/>
			<div
				className={cx(
					styles.footer,
					showControls && styles.detailFooter,
					hasError && styles.error,
				)}
				role="status"
			>
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
						<span
							className={cx(styles.exitCode, showControls && styles.detailExitCode)}
						>
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
