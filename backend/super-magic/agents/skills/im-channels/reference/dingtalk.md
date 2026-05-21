# DingTalk AI Bot

Connects via DingTalk Stream mode with streaming typing support.

## Prerequisites

Create a bot application on the DingTalk Open Platform and obtain:
- **Client ID**: The application's AppKey
- **Client Secret**: The application's AppSecret

Also enable **Stream mode** for the bot on the DingTalk Open Platform.

## Credential Collection

Ask the user in sequence:
1. "Please provide the DingTalk bot's Client ID (AppKey)"
2. "Please provide the corresponding Client Secret (AppSecret)"

## Establish Connection

(Use run_sdk_snippet tool, python_code parameter:)

```
from sdk.tool import tool

result = tool.call("connect_dingtalk_bot", {
    "client_id": "<Client ID provided by user>",
    "client_secret": "<Client Secret provided by user>",
})
print(result.content)
```

## Result Handling

- Success: "DingTalk bot connected successfully. You can now chat with me in DingTalk with streaming typing support."
- Failure: Report the error, suggest checking whether Client ID and Client Secret are correct, and whether Stream mode has been enabled on the Open Platform
