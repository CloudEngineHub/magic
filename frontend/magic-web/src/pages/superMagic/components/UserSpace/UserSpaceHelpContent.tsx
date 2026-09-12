import { LockKeyhole } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import UserSpaceFileIcon from "./UserSpaceFileIcon"

// 说明中的固定目录示例只渲染图标，不查询用户文件或推断其是否存在。
const EXAMPLE_FOLDERS: AttachmentItem[] = [
	{ name: ".magic", relative_file_path: ".magic", is_directory: true },
	{ name: "memory", relative_file_path: ".magic/memory", is_directory: true },
	{ name: ".dws", relative_file_path: ".dws", is_directory: true },
	{ name: ".lark-cli", relative_file_path: ".lark-cli", is_directory: true },
	{ name: ".local", relative_file_path: ".local", is_directory: true },
]

/** 用户空间的静态说明；开关、面板布局和焦点恢复由共同帮助入口负责。 */
export default function UserSpaceHelpContent() {
	const { t } = useTranslation("super")
	const descriptions = [
		t("topicFiles.systemFiles.help.userMagic"),
		t("userSpace.fileHelp.memory"),
		t("userSpace.fileHelp.dingtalk"),
		t("userSpace.fileHelp.lark"),
		t("userSpace.fileHelp.tools"),
	]
	return (
		<>
			<p>{t("userSpace.help.introduction")}</p>
			<section className="space-y-2 rounded-lg border bg-muted/30 p-3">
				<h3 className="flex items-center gap-2 font-semibold">
					<LockKeyhole size={16} className="shrink-0" />
					{t("userSpace.help.privacyTitle")}
				</h3>
				<p>{t("userSpace.help.privacy")}</p>
				<p className="text-muted-foreground">{t("userSpace.help.sharedContent")}</p>
			</section>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("userSpace.help.foldersTitle")}</h3>
				<ul className="divide-y rounded-lg border px-3">
					{EXAMPLE_FOLDERS.map((item, index) => (
						<li key={item.relative_file_path} className="flex items-start gap-3 py-2.5">
							<span className="mt-1 inline-flex shrink-0">
								<UserSpaceFileIcon item={item} resourceTree={EXAMPLE_FOLDERS} />
							</span>
							<div className="min-w-0">
								<p className="font-medium">{item.name}</p>
								<p className="text-xs leading-5 text-muted-foreground">
									{descriptions[index]}
								</p>
							</div>
						</li>
					))}
				</ul>
			</section>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("userSpace.help.examplesTitle")}</h3>
				<p className="rounded-md bg-muted px-3 py-2">{t("userSpace.help.memoryExample")}</p>
				<p className="rounded-md bg-muted px-3 py-2">{t("userSpace.help.filesExample")}</p>
			</section>
			<section className="space-y-1">
				<h3 className="font-semibold">{t("userSpace.help.unfamiliarTitle")}</h3>
				<p className="text-muted-foreground">{t("userSpace.help.unfamiliar")}</p>
			</section>
		</>
	)
}
