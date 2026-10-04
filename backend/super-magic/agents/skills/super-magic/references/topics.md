# Topics

Find a topic with `list_topics(project_id, page=1, page_size=20)` and inspect it with `get_topic(topic_id)`. Use exact IDs when two topics have the same name.

`create_topic(project_id, name)` creates a topic in an accessible project. `update_topic(topic_id, name)` changes its name. `archive_topic(topic_id, archived)` archives or restores it. `delete_topic(topic_id)` uses the product's existing logical deletion behavior.

Read conversation history through `read_topic_messages`, described in [messages](messages.md). A project collaboration role does not grant broader topic-message access than the backend allows.
