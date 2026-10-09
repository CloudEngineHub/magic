import { memo, useCallback, useMemo } from "react"
import { useThemeMode } from "antd-style"
import { Code2, Copy, CircleAlert, CircleCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MonacoEditor, type editor } from "@/infrastructure/editors/monaco"
import { clipboard } from "@/utils/clipboard-helpers"
import magicToast from "@/components/base/MagicToaster/utils"
import { Spinner } from "@/components/shadcn-ui/spinner"
import CommonHeaderV2 from "../../components/CommonHeaderV2"
import { ActionButton } from "../../components/CommonHeader/components"
import type { ActionContext } from "../../components/CommonHeaderV2/types"
import type { DetailScriptExecutionData, TerminalToolInfo } from "../../types"
import { TerminalOutput } from "../Terminal/components/TerminalOutput"
import { useStyles } from "./styles"

interface ScriptExecutionProps {
	data: DetailScriptExecutionData
	terminalToolInfo?: TerminalToolInfo
	type?: string
	isFromNode?: boolean
	onFullscreen?: () => void
	onDownload?: () => void
	isFullscreen?: boolean
	currentFile?: {
		id: string
		name: string
		type: string
		url?: string
	}
	allowEdit?: boolean
	className?: string
}

interface OutputStreamProps {
	label: string
	content: string
	recordKey: string
	className: string
	emptyLabel: string
}

function OutputStream({ label, content, recordKey, className, emptyLabel }: OutputStreamProps) {
	const { styles } = useStyles()

	return (
		<section className={className} aria-label={label}>
			<div className={styles.streamHeader}>{label}</div>
			<div className={styles.streamContent}>
				{content ? (
					<TerminalOutput content={content} recordKey={recordKey} showControls />
				) : (
					<div className={styles.emptyOutput}>{emptyLabel}</div>
				)}
			</div>
		</section>
	)
}

export default memo(function ScriptExecution({
	data,
	terminalToolInfo,
	type,
	isFromNode,
	onFullscreen,
	onDownload,
	isFullscreen,
	currentFile,
	allowEdit,
	className,
}: ScriptExecutionProps) {
	const { styles, cx } = useStyles()
	const { appearance } = useThemeMode()
	const { t } = useTranslation("super")
	const recordKey = terminalToolInfo?.id ?? `script-execution:${data.exit_code}`

	const handleCopy = useCallback(async () => {
		if (!data.code) {
			magicToast.warning(t("scriptExecution.noCodeToCopy"))
			return
		}

		try {
			await clipboard.writeText(data.code)
			magicToast.success(t("common.copySuccess"))
		} catch {
			magicToast.error(t("common.copyFailed"))
		}
	}, [data.code, t])

	const codeEditorOptions = useMemo<editor.IStandaloneEditorConstructionOptions>(
		() => ({
			readOnly: true,
			domReadOnly: true,
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: "on",
			lineNumbersMinChars: 3,
			lineDecorationsWidth: 8,
			folding: true,
			glyphMargin: false,
			wordWrap: "on",
			fontSize: 14,
			lineHeight: 22,
			fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
			padding: { top: 8, bottom: 8 },
			scrollBeyondLastLine: false,
			scrollbar: { vertical: "auto", horizontal: "auto", alwaysConsumeMouseWheel: false },
			contextmenu: false,
			renderLineHighlight: "none",
			overviewRulerLanes: 0,
			largeFileOptimizations: true,
		}),
		[],
	)

	const headerActionConfig = useMemo(
		() => ({
			customActions: [
				{
					key: "script-execution-title",
					zone: "leading" as const,
					render: () => (
						<div className={styles.title}>
							<Code2 size={16} aria-hidden />
							<span>{t("scriptExecution.title")}</span>
							<span className={styles.readOnly}>{t("terminal.readOnly")}</span>
						</div>
					),
				},
				{
					key: "script-execution-copy",
					zone: "secondary" as const,
					render: ({ showButtonText, isMobile }: ActionContext) => (
						<ActionButton
							icon={<Copy size={16} />}
							size={16}
							onClick={handleCopy}
							title={t("scriptExecution.copyCode")}
							text={t("scriptExecution.copyCode")}
							showText={showButtonText && !isMobile}
						/>
					),
				},
			],
		}),
		[handleCopy, styles.readOnly, styles.title, t],
	)

	return (
		<div className={cx(styles.scriptExecutionContainer, className)}>
			<div className={styles.toolbar}>
				<CommonHeaderV2
					renderMode="actions"
					type={type}
					onFullscreen={onFullscreen}
					onDownload={onDownload}
					isFromNode={isFromNode}
					isFullscreen={isFullscreen}
					currentFile={currentFile}
					allowEdit={allowEdit}
					actionConfig={headerActionConfig}
				/>
			</div>
			<div className={styles.content}>
				<section
					className={cx(styles.section, styles.codeSection)}
					aria-label={t("scriptExecution.code")}
				>
					<div className={styles.sectionHeader}>{t("scriptExecution.code")}</div>
					<div className={styles.codeBody}>
						<MonacoEditor
							height="100%"
							language="python"
							value={data.code}
							options={codeEditorOptions}
							theme={appearance === "dark" ? "vs-dark" : "light"}
							loading={
								<div className={styles.loading}>
									<Spinner size={20} />
								</div>
							}
						/>
					</div>
				</section>

				<section
					className={cx(styles.section, styles.outputSection)}
					aria-label={t("scriptExecution.output")}
				>
					<div className={styles.sectionHeader}>{t("scriptExecution.output")}</div>
					<div className={styles.outputBody}>
						<OutputStream
							label={t("scriptExecution.stdout")}
							content={data.stdout}
							recordKey={`${recordKey}:stdout`}
							className={styles.outputStream}
							emptyLabel={t("scriptExecution.noOutput")}
						/>
						<OutputStream
							label={t("scriptExecution.stderr")}
							content={data.stderr}
							recordKey={`${recordKey}:stderr`}
							className={styles.outputStream}
							emptyLabel={t("scriptExecution.noOutput")}
						/>
					</div>
				</section>
			</div>
			<div className={styles.footer} role="status">
				<span className={cx(styles.status, !data.success && styles.error)}>
					{data.success ? (
						<CircleCheck size={16} aria-hidden />
					) : (
						<CircleAlert size={16} aria-hidden />
					)}
					{data.success
						? t("terminal.returnedNormally")
						: t("terminal.returnedWithError")}
				</span>
				<span className={styles.exitCode}>
					{t("terminal.exitCode")}: {data.exit_code}
				</span>
			</div>
		</div>
	)
})
