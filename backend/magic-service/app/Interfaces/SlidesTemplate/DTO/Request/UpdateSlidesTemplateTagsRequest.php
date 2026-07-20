<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\__;

class UpdateSlidesTemplateTagsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'tag_codes' => 'nullable|array',
            'tag_codes.*' => 'string|max:64|regex:/^[a-z0-9]+(-[a-z0-9]+)*$/',
        ];
    }

    public function messages(): array
    {
        return [
            'tag_codes.array' => __('slides_template.tag_codes_array'),
            'tag_codes.*.string' => __('slides_template.tag_codes_string'),
            'tag_codes.*.max' => __('slides_template.tag_code_max'),
            'tag_codes.*.regex' => __('slides_template.tag_code_regex'),
        ];
    }

    public function getTagCodes(): array
    {
        $tagCodes = $this->input('tag_codes', []);
        if (! is_array($tagCodes)) {
            return [];
        }

        $result = [];
        foreach ($tagCodes as $tagCode) {
            if (! is_string($tagCode)) {
                continue;
            }
            $tagCode = trim($tagCode);
            if ($tagCode !== '') {
                $result[$tagCode] = $tagCode;
            }
        }
        return array_values($result);
    }
}
