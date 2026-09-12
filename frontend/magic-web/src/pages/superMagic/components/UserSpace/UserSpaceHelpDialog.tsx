import { LockKeyhole } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
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

/** 用户空间的静态说明；Dialog 的开关和焦点恢复由标题栏入口负责。 */
export default function UserSpaceHelpDialog() {
	const { t } = useTranslation("super")
	const descriptions = [
		t("userSpace.fileHelp.magic"),
		t("userSpace.fileHelp.memory"),
		t("userSpace.fileHelp.dingtalk"),
		t("userSpace.fileHelp.lark"),
		t("userSpace.fileHelp.tools"),
	]
	return (
		<DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-[560px]">
			<DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left">
				<DialogTitle className="pr-7 leading-6">{t("userSpace.help.title")}</DialogTitle>
				<DialogDescription>{t("userSpace.help.subtitle")}</DialogDescription>
			</DialogHeader>
			<div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-5 text-sm leading-6">
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
							<li
								key={item.relative_file_path}
								className="flex items-start gap-3 py-2.5"
							>
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
					<p className="rounded-md bg-muted px-3 py-2">
						{t("userSpace.help.memoryExample")}
					</p>
					<p className="rounded-md bg-muted px-3 py-2">
						{t("userSpace.help.filesExample")}
					</p>
				</section>
				<section className="space-y-1">
					<h3 className="font-semibold">{t("userSpace.help.unfamiliarTitle")}</h3>
					<p className="text-muted-foreground">{t("userSpace.help.unfamiliar")}</p>
				</section>
			</div>
			<DialogFooter className="shrink-0 border-t px-5 py-3">
				<DialogClose asChild>
					<Button>{t("userSpace.help.close")}</Button>
				</DialogClose>
			</DialogFooter>
		</DialogContent>
	)
}
