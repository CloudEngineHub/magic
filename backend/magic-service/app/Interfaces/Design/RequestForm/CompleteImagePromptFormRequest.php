<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Design\RequestForm;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\trans;

class CompleteImagePromptFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'project_id' => 'required|integer|min:1',
            'user_prompt' => 'required|string|max:4096',
            'model_id' => 'nullable|string|max:80',
            'reference_images' => 'nullable|array|max:10',
            'reference_images.*' => 'required|string|max:512',
            'reference_image_options' => 'nullable|array|max:10',
            'reference_image_options.*' => 'array',
            'reference_image_options.*.path' => 'nullable|string|max:512',
            'reference_image_options.*.crop' => 'nullable|array',
            'reference_image_options.*.crop.x' => 'nullable|numeric|min:0',
            'reference_image_options.*.crop.y' => 'nullable|numeric|min:0',
            'reference_image_options.*.crop.width' => 'nullable|numeric|min:1',
            'reference_image_options.*.crop.height' => 'nullable|numeric|min:1',
        ];
    }

    public function attributes(): array
    {
        return [
            'project_id' => trans('design.attributes.project_id'),
            'user_prompt' => trans('design.attributes.user_prompt'),
            'model_id' => trans('design.attributes.model_id'),
            'reference_images' => trans('design.attributes.reference_images'),
            'reference_images.*' => trans('design.attributes.reference_image'),
            'reference_image_options' => trans('design.attributes.reference_image_options'),
        ];
    }

    public function messages(): array
    {
        return [
            'reference_images.max' => trans('design.validation.reference_images_max_10'),
            'reference_image_options.max' => trans('design.validation.reference_image_options_max_10'),
        ];
    }
}
