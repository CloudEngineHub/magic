<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Design\RequestForm;

use function Hyperf\Translation\trans;

class GenerateImagesFormRequest extends GenerateImageFormRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'generate_num' => 'required|integer|min:1',
        ]);
    }

    public function attributes(): array
    {
        return array_merge(parent::attributes(), [
            'generate_num' => trans('design.attributes.generate_num'),
        ]);
    }
}
