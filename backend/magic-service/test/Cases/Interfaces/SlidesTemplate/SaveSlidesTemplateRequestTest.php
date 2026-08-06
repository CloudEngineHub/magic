<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Interfaces\SlidesTemplate;

use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class SaveSlidesTemplateRequestTest extends TestCase
{
    public function testCategoryCodeOnlyRequiresNullableStringWithMaxLength(): void
    {
        /** @var SaveSlidesTemplateRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();

        $this->assertArrayHasKey('category_code', $rules);
        $this->assertArrayNotHasKey('category_id', $rules);
        $this->assertSame('nullable|string|max:64', $rules['category_code']);
        $this->assertArrayNotHasKey('category_code.regex', $request->messages());
    }

    public function testUsageCountFieldsAreNotAcceptedFromAdminRequest(): void
    {
        /** @var SaveSlidesTemplateRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();

        $this->assertArrayNotHasKey('base_usage_count', $rules);
        $this->assertArrayNotHasKey('actual_usage_count', $rules);
        $this->assertArrayNotHasKey('total_usage_count', $rules);
    }

    public function testTemplateCodeAllowsSlidesTemplatePrefixes(): void
    {
        /** @var SaveSlidesTemplateRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();

        $this->assertIsArray($rules['code']);
        $regexRule = array_values(array_filter(
            $rules['code'],
            static fn (mixed $rule): bool => is_string($rule) && str_starts_with($rule, 'regex:')
        ))[0] ?? '';
        $regex = substr($regexRule, strlen('regex:'));

        $this->assertSame(1, preg_match($regex, 'PPT-business-minimal'));
        $this->assertSame(1, preg_match($regex, 'SLIDE-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'SLD-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'PDF-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'PPTX-business-minimal'));
    }
}
