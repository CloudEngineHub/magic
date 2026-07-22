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
    public function testCodeRuleAllowsSlidesTemplateCategoryPrefixes(): void
    {
        /** @var SaveSlidesTemplateCategoryRequest $request */
        $request = (new ReflectionClass(SaveSlidesTemplateCategoryRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();
        $regex = $this->extractRegexRule((string) $rules['code']);

        $this->assertSame(1, preg_match($regex, 'PPT-CATE-business'));
        $this->assertSame(1, preg_match($regex, 'SLIDE-CATE-business'));
        $this->assertSame(0, preg_match($regex, 'ppt-category-business'));
        $this->assertSame(0, preg_match($regex, 'SLD-CATE-business'));
    }

    private function extractRegexRule(string $rule): string
    {
        foreach (explode('|', $rule) as $item) {
            if (str_starts_with($item, 'regex:')) {
                return substr($item, strlen('regex:'));
            }
        }

        $this->fail('Missing regex rule.');
    }
}
