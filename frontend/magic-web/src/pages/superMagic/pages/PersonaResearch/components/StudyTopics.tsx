import { useState } from "react"
import { observer } from "mobx-react-lite"
import { Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import MagicTooltip from "@/components/base/MagicTooltip"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { usePersonaResearchStore } from "../context"
import { ResearchOperationError } from "../services/researchOperationError"

/** Conversations change independently; the study and its deliverables stay selected. */
function StudyTopics() {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const navigate = useNavigate()
	const [creating, setCreating] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [name, setName] = useState("")
	const selected = store.selectedTopic
	if (store.isReadOnly || !store.study?.topic_id || !selected) return null
	const canChange = store.canChangeStudyTopics
	const openTopic = (id: string) =>
		navigate({ name: RouteName.PersonaResearchStudy, params: { topicId: id } })
	const create = async () => {
		try {
			const topic = await store.createStudyTopic(name)
			if (!topic) return
			setCreating(false)
			setName("")
			openTopic(topic.id)
			toast.success(t("topics.created"))
		} catch (error) {
			if (
				error instanceof ResearchOperationError &&
				error.stage === "rename" &&
				error.progress.topic
			) {
				setCreating(false)
				setName("")
				openTopic(error.progress.topic.id)
				toast.warning(t("topics.nameNotSaved"))
			} else if (error instanceof ResearchOperationError && error.cleanupErrors.length) {
				toast.error(t("topics.cleanupFailed"))
			} else if (error instanceof ResearchOperationError && error.progress.markerSaved) {
				toast.warning(t("topics.createdNeedsRefresh"))
			} else toast.error(t("topics.createFailed"))
		}
	}
	const remove = async () => {
		const fallback = store.studyTopics.find((topic) => topic.id !== selected.id)
		try {
			await store.deleteStudyTopic(selected.id)
			setDeleting(false)
			if (fallback) openTopic(fallback.id)
			toast.success(t("topics.deleted"))
		} catch (error) {
			if (
				error instanceof ResearchOperationError &&
				error.progress.deletedTopicIds?.includes(selected.id)
			) {
				setDeleting(false)
				if (fallback) openTopic(fallback.id)
				toast.warning(t("topics.childDeletedCleanupFailed"))
			} else toast.error(t("topics.deleteFailed"))
		}
	}
	return (
		<div className="shrink-0 border-b border-border px-3 py-2">
			<div className="flex items-center gap-2">
				<Select
					value={selected.id}
					onValueChange={openTopic}
					disabled={store.isChangingStudyTopics}
				>
					<SelectTrigger className="h-8 min-w-0 flex-1" aria-label={t("topics.label")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{store.studyTopics.map((topic) => (
							<SelectItem key={topic.id} value={topic.id}>
								{topic.id === store.study?.topic_id
									? t("topics.primary")
									: topic.topic_name || t("topics.untitled")}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<MagicTooltip title={canChange ? undefined : t("topics.waitForIdle")}>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 shrink-0 gap-1"
						disabled={!canChange}
						onClick={() => setCreating(true)}
					>
						<Plus className="size-4" />
						{t("topics.create")}
					</Button>
				</MagicTooltip>
				{selected.id !== store.study.topic_id && (
					<MagicTooltip title={t("topics.delete")}>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							aria-label={t("topics.delete")}
							disabled={!canChange}
							onClick={() => setDeleting(true)}
						>
							<Trash2 className="size-4" />
						</Button>
					</MagicTooltip>
				)}
			</div>
			<Dialog
				open={creating}
				onOpenChange={(open) => {
					if (!store.isChangingStudyTopics) setCreating(open)
				}}
			>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault()
							void create()
						}}
					>
						<DialogHeader>
							<DialogTitle>{t("topics.createTitle")}</DialogTitle>
							<DialogDescription>{t("topics.createDescription")}</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-2">
							<Label htmlFor="research-topic-name">{t("topics.name")}</Label>
							<Input
								id="research-topic-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								maxLength={100}
								disabled={store.isChangingStudyTopics}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={store.isChangingStudyTopics}
								onClick={() => setCreating(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit" disabled={!canChange || !name.trim()}>
								{store.isChangingStudyTopics
									? t("topics.creating")
									: t("topics.create")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			<AlertDialog open={deleting} onOpenChange={setDeleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("topics.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("topics.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction disabled={!canChange} onClick={() => void remove()}>
							{t("topics.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export default observer(StudyTopics)
