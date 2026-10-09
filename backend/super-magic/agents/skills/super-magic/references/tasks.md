# Tasks in other topics

`start_topic_task(project_id, topic_id, content, force_interrupt=False)` submits plain-text work using the target topic's Agent mode. The topic must belong to the supplied project. On an idle topic it creates a new product task and returns `task_id`; creating a topic first and starting its task are separate actions. `send_topic_message` accepts the same parameters for a follow-up, which also creates a new task or queue entry rather than changing an earlier task.

When a topic already has an active task, `force_interrupt=False` queues the new message and returns `queue_id`. `force_interrupt=True` asks the service to suspend that active task and start this one immediately, returning a new `task_id`. Use interruption only when the user's intent includes replacing the current work; do not choose it solely to avoid a queue receipt. A queue ID is never a task ID, and this tool set has no reliable queue-to-task mapping.

`get_topic_task(task_id)` reads a real task's status; only `task_status="finished"` has a final result. `cancel_topic_task(task_id)` requests cancellation. `list_topic_queued_messages(topic_id, page=1, page_size=20)` inspects a topic's queue; `delete_topic_queued_message(queue_id)` withdraws an entry when permitted. Queue delivery does not mean Agent completion. If a task is waiting, suspended, failed, or queued, report that state rather than claiming the work is done.

Status checks should be bounded to about 60 seconds in one user-facing turn. Canceling a local wait does not cancel the remote task. A lost submission response may still represent an accepted write; inspect state before resubmitting.
