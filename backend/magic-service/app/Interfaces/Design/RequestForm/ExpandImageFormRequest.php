<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Design\RequestForm;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\trans;

class ExpandImageFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'project_id' => 'required|integer|min:1',
            'image_id' => 'required|string|max:80',
            'file_dir' => 'required|string|max:512',
            'file_path' => 'required|string|max:512',
            'canvas_path' => 'required|string|max:512',
            'mask_path' => 'required|string|max:512',
            'prompt' => 'nullable|string|max:4096',
            'custom_prompt' => 'nullable|string|max:4096',
            'size' => 'nullable|string|max:50',
            'reference_image_options' => 'nullable|array',
            'reference_image_options.*' => 'array',
            'reference_image_options.*.path' => 'nullable|string|max:512',
            'reference_image_options.*.crop' => 'nullable|array',
            'image_generation_config' => 'nullable|array',
            'generate_config' => 'nullable|array',
        ];
    }

    public function attributes(): array
    {
        return [
            'project_id' => trans('design.attributes.project_id'),
            'image_id' => trans('design.attributes.image_id'),
            'file_dir' => trans('design.attributes.file_dir'),
            'file_path' => trans('design.attributes.file_path'),
            'canvas_path' => trans('design.attributes.canvas_path'),
            'mask_path' => trans('design.attributes.mark_path'),
            'prompt' => trans('design.attributes.prompt'),
            'custom_prompt' => trans('design.attributes.prompt'),
            'size' => trans('design.attributes.size'),
            'image_generation_config' => trans('design.attributes.image_generation_config'),
            'generate_config' => trans('design.attributes.image_generation_config'),
        ];
    }
}
