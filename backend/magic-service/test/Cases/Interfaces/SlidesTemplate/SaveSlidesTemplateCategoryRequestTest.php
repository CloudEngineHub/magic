<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Interfaces\SlidesTemplate;

use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateCategoryRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class SaveSlidesTemplateCategoryRequestTest extends TestCase
{
    public function testCodeOnlyRequiresNullableStringWithMaxLength(): void
    {
        /** @var SaveSlidesTemplateCategoryRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateCategoryRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();
        $this->assertSame('nullable|string|max:64', $rules['code']);
        $this->assertArrayNotHasKey('code.regex', $request->messages());
    }
}
