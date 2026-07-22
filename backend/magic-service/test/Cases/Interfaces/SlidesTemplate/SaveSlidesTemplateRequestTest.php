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

        preg_match('/regex:(.+)$/', (string) $rules['category_code'], $matches);
        $regex = $matches[1] ?? '';

        $this->assertSame(1, preg_match($regex, 'PPT-CATE-business'));
        $this->assertSame(1, preg_match($regex, 'SLIDE-CATE-business'));
        $this->assertSame(0, preg_match($regex, 'SLD-CATE-business'));
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

        preg_match('/regex:(.+)$/', (string) $rules['code'], $matches);
        $regex = $matches[1] ?? '';

        $this->assertSame(1, preg_match($regex, 'PPT-business-minimal'));
        $this->assertSame(1, preg_match($regex, 'SLIDE-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'SLD-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'PDF-business-minimal'));
        $this->assertSame(0, preg_match($regex, 'PPTX-business-minimal'));
    }
}
