# Tasks in other topics

Use `start_topic_task(project_id, topic_id, content)` to submit plain-text work to a target topic. For a follow-up in an existing topic, use `send_topic_message` with the same fields. A follow-up creates a new task or queue entry; it does not mutate an earlier task. Both tools preserve the target topic's Agent mode and do not interrupt its active task.

A successful submission returns either `kind="task"` with `task_id`, or `kind="queue"` with `queue_id`. Query a task with `get_topic_task(task_id)`; only `task_status="finished"` has a final result. Use `cancel_topic_task(task_id)` to request cancellation. If a task is waiting for the user, suspended, or failed, report that state and the needed next action.

For a queued submission, use `list_topic_queued_messages(topic_id, page=1, page_size=20)` to inspect the queue and `delete_topic_queued_message(queue_id)` to withdraw an entry when permitted. Queue completion means delivery processing finished, not that the Agent completed a task. There is no reliable queue-to-task ID mapping in this tool set. Never pass a queue ID to `get_topic_task` or guess a task ID from nearby records.

Wait for task results only with bounded status checks, no longer than about 60 seconds in one user-facing turn. Canceling a local wait does not cancel the remote task. A lost submission response may still represent an accepted write; check existing state before attempting to submit it again.
