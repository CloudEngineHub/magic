<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

class GetSlidesTemplateFileUrlRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'topic_id' => 'nullable|string|max:64',
            'chat_topic_id' => 'nullable|string|max:64',
            'project_id' => 'nullable|string|max:64',
            'task_id' => 'nullable|string|max:64',
            'message_id' => 'nullable|string|max:64',
            'source' => 'nullable|string|max:64',
        ];
    }

    public function getAccessContext(): array
    {
        $context = [];
        foreach (array_keys($this->rules()) as $key) {
            $value = trim((string) $this->input($key, ''));
            if ($value !== '') {
                $context[$key] = $value;
            }
        }
        return $context;
    }
}
