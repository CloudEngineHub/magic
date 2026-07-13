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
    public function testCategoryCodeReplacesCategoryId(): void
    {
        /** @var SaveSlidesTemplateRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();

        $this->assertArrayHasKey('category_code', $rules);
        $this->assertArrayNotHasKey('category_id', $rules);
        $this->assertStringContainsString('regex:/^PPT-CATE-', (string) $rules['category_code']);
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
}
