<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Task\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;
use App\Infrastructure\SuperMagic\Utils\TiptapBuilder;

/**
 * Create open task request DTO (simplified for open API).
 * This DTO provides a simplified interface for external API calls,
 * converting simple parameters to the complex internal message structure.
 */
class CreateOpenTaskRequestDTO extends AbstractRequestDTO
{
    /**
     * Project ID.
     */
    public string $projectId = '';

    /**
     * Topic ID.
     */
    public string $topicId = '';

    /**
     * Message content (plain text, will be converted to Tiptap format).
     */
    public string $content = '';

    /**
     * Agent mode (topic pattern).
     * Frontend can define custom values like: general, debug, etc.
     */
    public string $agentMode = 'general';

    /**
     * LLM model ID (optional).
     */
    public string $modelId = '';

    /**
     * Image model ID (optional).
     */
    public string $imageModelId = '';

    /**
     * Video model ID (optional).
     */
    public string $videoModelId = '';

    /**
     * Enable web search.
     */
    public bool $enableWebSearch = true;

    /**
     * Interrupt the current task instead of queuing this message.
     */
    public bool $forceInterrupt = false;

    /**
     * Optional extra message subscription config (single item).
     * Will be appended to the system subscription list when initializing the sandbox.
     * Supported fields: method, url, auth_scheme, headers.
     */
    public ?array $messageSubscriptionConfig = null;

    public function getProjectId(): string
    {
        return $this->projectId;
    }

    public function getTopicId(): string
    {
        return $this->topicId;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function getAgentMode(): string
    {
        return $this->agentMode;
    }

    public function getModelId(): string
    {
        return $this->modelId;
    }

    public function getImageModelId(): string
    {
        return $this->imageModelId;
    }

    public function getVideoModelId(): string
    {
        return $this->videoModelId;
    }

    public function getEnableWebSearch(): bool
    {
        return $this->enableWebSearch;
    }

    public function isForceInterrupt(): bool
    {
        return $this->forceInterrupt;
    }

    public function getMessageSubscriptionConfig(): ?array
    {
        return $this->messageSubscriptionConfig;
    }

    /**
     * Convert this Open API DTO to the internal CreateTaskRequestDTO format.
     *
     * All format differences (plain text → Tiptap, model/agent config placement)
     * are handled here so callers stay clean.
     */
    public function toCreateTaskRequestDTO(): CreateTaskRequestDTO
    {
        $superAgent = [
            'mentions' => [],
            'chat_mode' => 'normal',
            'topic_pattern' => $this->agentMode ?: 'general',
            'enable_web_search' => $this->enableWebSearch,
        ];

        if ($this->modelId !== '') {
            $superAgent['model'] = ['model_id' => $this->modelId];
        }
        if ($this->imageModelId !== '') {
            $superAgent['image_model'] = ['model_id' => $this->imageModelId];
        }
        if ($this->videoModelId !== '') {
            $superAgent['video_model'] = ['model_id' => $this->videoModelId];
        }

        return new CreateTaskRequestDTO([
            'project_id' => $this->projectId,
            'topic_id' => $this->topicId,
            'message_type' => 'rich_text',
            'force_interrupt' => $this->forceInterrupt,
            'message_content' => [
                'content' => TiptapBuilder::plainTextToJson($this->content),
                'instructs' => [['value' => 'normal']],
                'extra' => ['super_agent' => $superAgent],
            ],
        ]);
    }

    /**
     * Get validation rules.
     */
    protected static function getHyperfValidationRules(): array
    {
        return [
            'project_id' => 'required|string',
            'topic_id' => 'required|string',
            'content' => 'required|string|max:65000',
            'agent_mode' => 'nullable|string|max:50',
            'model_id' => 'nullable|string|max:100',
            'image_model_id' => 'nullable|string|max:100',
            'video_model_id' => 'nullable|string|max:100',
            'enable_web_search' => 'nullable|boolean',
            'force_interrupt' => 'nullable|boolean',
            'message_subscription_config' => 'nullable|array',
            'message_subscription_config.method' => 'required_with:message_subscription_config|string',
            'message_subscription_config.url' => 'required_with:message_subscription_config|string',
            'message_subscription_config.auth_scheme' => 'nullable|string',
            'message_subscription_config.headers' => 'nullable|array',
        ];
    }

    /**
     * Get custom error messages for validation failures.
     */
    protected static function getHyperfValidationMessage(): array
    {
        return [
            'project_id.required' => 'Project ID is required',
            'project_id.string' => 'Project ID must be a string',
            'topic_id.required' => 'Topic ID is required',
            'topic_id.string' => 'Topic ID must be a string',
            'content.required' => 'Message content is required',
            'content.string' => 'Message content must be a string',
            'content.max' => 'Message content cannot exceed 65000 characters',
            'agent_mode.string' => 'Agent mode must be a string',
            'agent_mode.max' => 'Agent mode cannot exceed 50 characters',
            'model_id.string' => 'Model ID must be a string',
            'model_id.max' => 'Model ID cannot exceed 100 characters',
            'image_model_id.string' => 'Image model ID must be a string',
            'image_model_id.max' => 'Image model ID cannot exceed 100 characters',
            'video_model_id.string' => 'Video model ID must be a string',
            'video_model_id.max' => 'Video model ID cannot exceed 100 characters',
            'enable_web_search.boolean' => 'Enable web search must be a boolean value',
            'force_interrupt.boolean' => 'Force interrupt must be a boolean value',
            'message_subscription_config.array' => 'Message subscription config must be an array',
            'message_subscription_config.method.required_with' => 'Subscription config method is required',
            'message_subscription_config.method.string' => 'Subscription config method must be a string',
            'message_subscription_config.url.required_with' => 'Subscription config URL is required',
            'message_subscription_config.url.string' => 'Subscription config URL must be a string',
        ];
    }
}
