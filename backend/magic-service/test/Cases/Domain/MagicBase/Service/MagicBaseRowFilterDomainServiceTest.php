<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterCondition;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterGroup;
use App\Domain\MagicBase\Exception\MagicBaseInvalidFilterException;
use App\Domain\MagicBase\Service\MagicBaseRowFilterDomainService;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class MagicBaseRowFilterDomainServiceTest extends TestCase
{
    private MagicBaseRowFilterDomainService $service;

    protected function setUp(): void
    {
        $this->service = new MagicBaseRowFilterDomainService();
    }

    public function testParsesLegacyFiltersThroughTheTypedValidationPath(): void
    {
        $filter = $this->service->parse([
            'name' => ['eq' => ' Apple '],
            'price' => ['gte' => '1000'],
        ], [
            'name' => 'text',
            'price' => 'number',
        ]);

        $this->assertSame('and', $filter->getLogic());
        $this->assertCount(2, $filter->getItems());
        $this->assertCondition($filter->getItems()[0], 'name', 'eq', 'Apple', 'text');
        $this->assertCondition($filter->getItems()[1], 'price', 'gte', 1000, 'number');
    }

    public function testParsesLegacyFieldsNamedLogicAndItems(): void
    {
        $filter = $this->service->parse([
            'logic' => ['eq' => 'business'],
            'items' => ['eq' => 'phone'],
        ], [
            'logic' => 'text',
            'items' => 'text',
        ]);

        $this->assertCondition($filter->getItems()[0], 'logic', 'eq', 'business', 'text');
        $this->assertCondition($filter->getItems()[1], 'items', 'eq', 'phone', 'text');
    }

    public function testParsesBoundedAndOrGroups(): void
    {
        $filter = $this->service->parse([
            'logic' => 'and',
            'items' => [
                ['field' => 'price', 'operator' => 'lte', 'value' => 5000],
                [
                    'logic' => 'or',
                    'items' => [
                        ['field' => 'name', 'operator' => 'contains', 'value' => '苹果'],
                        ['field' => 'active', 'operator' => 'eq', 'value' => 'true'],
                    ],
                ],
            ],
        ], [
            'name' => 'text',
            'price' => 'number',
            'active' => 'boolean',
        ]);

        $this->assertSame('and', $filter->getLogic());
        $this->assertCondition($filter->getItems()[0], 'price', 'lte', 5000, 'number');
        $nested = $filter->getItems()[1];
        $this->assertInstanceOf(MagicBaseFilterGroup::class, $nested);
        $this->assertSame('or', $nested->getLogic());
        $this->assertCondition($nested->getItems()[0], 'name', 'contains', '苹果', 'text');
        $this->assertCondition($nested->getItems()[1], 'active', 'eq', true, 'boolean');
    }

    public function testRejectsMalformedRootGroupInsteadOfTreatingItAsLegacyFilter(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('筛选条件组 items 必须是数组');

        $this->service->parse([
            'logic' => 'and',
        ], ['name' => 'text']);
    }

    public function testRejectsEmptyOrGroups(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('任意满足条件组至少需要一个条件');

        $this->service->parse([
            'logic' => 'or',
            'items' => [],
        ], ['name' => 'text']);
    }

    public function testKeepsEmptyRootAndGroupsAsNoFilter(): void
    {
        $filter = $this->service->parse([
            'logic' => 'and',
            'items' => [],
        ], ['name' => 'text']);

        $this->assertSame('and', $filter->getLogic());
        $this->assertSame([], $filter->getItems());
    }

    public function testRejectsEmptyNestedAndGroups(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('嵌套筛选条件组至少需要一个条件');

        $this->service->parse([
            'logic' => 'and',
            'items' => [[
                'logic' => 'and',
                'items' => [],
            ]],
        ], ['name' => 'text']);
    }

    public function testRejectsUnreadableFields(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('筛选字段不存在或当前用户无读取权限');

        $this->service->parse([
            'logic' => 'and',
            'items' => [
                ['field' => 'secret', 'operator' => 'eq', 'value' => 'hidden'],
            ],
        ], ['name' => 'text']);
    }

    public function testRejectsShortContainsSearch(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('包含搜索内容长度必须在 2 到 100 个字符之间');

        $this->service->parse([
            'logic' => 'and',
            'items' => [
                ['field' => 'name', 'operator' => 'contains', 'value' => 'A'],
            ],
        ], ['name' => 'text']);
    }

    public function testRejectsOperatorsThatDoNotMatchTheFieldType(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('字段类型不支持该筛选操作符');

        $this->service->parse([
            'logic' => 'and',
            'items' => [
                ['field' => 'active', 'operator' => 'contains', 'value' => 'true'],
            ],
        ], ['active' => 'boolean']);
    }

    public function testRejectsInOperatorForDatetimeFields(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('字段类型不支持该筛选操作符');

        $this->service->parse([
            'logic' => 'and',
            'items' => [
                ['field' => 'starts_at', 'operator' => 'in', 'value' => ['2026-07-25']],
            ],
        ], ['starts_at' => 'datetime']);
    }

    public function testAllowsEmptyLegacyInConditionForUnmatchedRelations(): void
    {
        $filter = $this->service->parse([
            'customer_id' => ['in' => []],
        ], ['customer_id' => 'number']);

        $this->assertCondition($filter->getItems()[0], 'customer_id', 'in', [], 'number');
    }

    public function testAllowsTrustedRelationValuesAboveThePublicInLimit(): void
    {
        $values = range(1, 101);
        $filter = $this->service->parse([
            'customer_id' => ['in' => $values],
        ], ['customer_id' => 'number'], ['customer_id']);

        $this->assertCondition($filter->getItems()[0], 'customer_id', 'in', $values, 'number');
    }

    public function testRejectsPublicInValuesAboveTheLimit(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('in 操作符最多支持 100 个值');

        $this->service->parse([
            'customer_id' => ['in' => range(1, 101)],
        ], ['customer_id' => 'number']);
    }

    public function testRejectsRecordIdsOutsideThePlatformIntegerRange(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('记录 ID 必须是正整数');

        $this->service->parse([
            'id' => ['eq' => '999999999999999999999999'],
        ], []);
    }

    public function testRejectsInvalidCalendarDates(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('日期筛选值格式不正确');

        $this->service->parse([
            'starts_at' => ['eq' => '2026-02-31'],
        ], ['starts_at' => 'datetime']);
    }

    public function testRejectsRelativeDatetimeExpressions(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('日期筛选值格式不正确');

        $this->service->parse([
            'starts_at' => ['eq' => '2026-07-25 tomorrow'],
        ], ['starts_at' => 'datetime']);
    }

    public function testRejectsTimezoneDatetimeExpressionsForLocalDatetimeFields(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('日期筛选值格式不正确');

        $this->service->parse([
            'starts_at' => ['eq' => '2026-07-25T02:00:00Z'],
        ], ['starts_at' => 'datetime']);
    }

    public function testRejectsRawMongoFieldExpressions(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('筛选字段不存在或当前用户无读取权限');

        $this->service->parse([
            '$where' => ['eq' => 'return true'],
        ], ['name' => 'text']);
    }

    public function testRejectsGroupsDeeperThanTwoLevels(): void
    {
        $this->expectException(MagicBaseInvalidFilterException::class);
        $this->expectExceptionMessage('筛选条件组最多支持两层嵌套');

        $this->service->parse([
            'logic' => 'and',
            'items' => [[
                'logic' => 'or',
                'items' => [[
                    'logic' => 'and',
                    'items' => [
                        ['field' => 'name', 'operator' => 'eq', 'value' => 'Apple'],
                    ],
                ]],
            ]],
        ], ['name' => 'text']);
    }

    private function assertCondition(
        mixed $node,
        string $field,
        string $operator,
        mixed $value,
        string $dataType,
    ): void {
        $this->assertInstanceOf(MagicBaseFilterCondition::class, $node);
        $this->assertSame($field, $node->getField());
        $this->assertSame($operator, $node->getOperator());
        $this->assertSame($value, $node->getValue());
        $this->assertSame($dataType, $node->getDataType());
    }
}
