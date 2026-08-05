<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\MagicBase\Repository;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterCondition;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterGroup;
use App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB\MagicBaseMongoQueryCompiler;
use MongoDB\BSON\Regex;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class MagicBaseMongoQueryCompilerTest extends TestCase
{
    public function testCompilesTypedConditionsWithoutAcceptingRawMongoExpressions(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('price', 'gte', 1000, 'number'),
            new MagicBaseFilterGroup('or', [
                new MagicBaseFilterCondition('name', 'contains', 'A.*', 'text'),
                new MagicBaseFilterCondition('active', 'eq', true, 'boolean'),
            ]),
            new MagicBaseFilterCondition('category', 'in', ['phone', 'tablet'], 'text'),
        ]));

        $this->assertSame(['$gte' => 1000], $compiled['$and'][0]['$or'][0]['data.price']);
        $this->assertInstanceOf(Regex::class, $compiled['$and'][1]['$or'][0]['data.name']);
        $this->assertSame('A\.\*', $compiled['$and'][1]['$or'][0]['data.name']->getPattern());
        $this->assertSame(
            ['$in' => [true, 1, '1']],
            $compiled['$and'][1]['$or'][1]['data.active'],
        );
        $this->assertSame(['$in' => ['phone', 'tablet']], $compiled['$and'][2]['data.category']);
    }

    public function testCompilesRecordIdAsMongoInteger(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('id', 'in', ['123', '456'], 'id'),
        ]));

        $this->assertSame(['record_id' => ['$in' => [123, 456]]], $compiled);
    }

    public function testKeepsSystemDatetimeFiltersAlignedWithStringStorage(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('created_at', 'gte', '2026-07-25 10:30:00', 'datetime'),
        ]));

        $this->assertSame([
            'created_at' => ['$gte' => '2026-07-25 10:30:00'],
        ], $compiled);
    }

    public function testCompilesDynamicDatetimeEqualityWithHistoricalStorageFormats(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('starts_at', 'eq', '2026-07-25 10:30:00', 'datetime'),
        ]));

        $this->assertSame([
            'data.starts_at' => ['$in' => [
                '2026-07-25 10:30:00',
                '2026-07-25T10:30:00',
                '2026-07-25 10:30',
                '2026-07-25T10:30',
            ]],
        ], $compiled);
    }

    public function testCompilesDynamicDatetimeRangesWithHistoricalMinutePrecision(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('starts_at', 'gte', '2026-07-25 10:30:45', 'datetime'),
        ]));

        $this->assertCount(4, $compiled['$or']);
        $this->assertSame(
            ['data.starts_at' => ['$gte' => '2026-07-25 10:30:45']],
            $compiled['$or'][0]['$and'][1],
        );
        $this->assertSame(
            ['data.starts_at' => ['$gte' => '2026-07-25T10:30:45']],
            $compiled['$or'][1]['$and'][1],
        );
        $this->assertSame(
            ['data.starts_at' => ['$gt' => '2026-07-25 10:30']],
            $compiled['$or'][2]['$and'][1],
        );
        $this->assertSame(
            ['data.starts_at' => ['$gt' => '2026-07-25T10:30']],
            $compiled['$or'][3]['$and'][1],
        );
    }

    public function testAdjustsDatetimeRangeOperatorsForHistoricalMinuteValues(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $cases = [
            ['gt', '2026-07-25 10:30:45', 'gt'],
            ['gte', '2026-07-25 10:30:45', 'gt'],
            ['lt', '2026-07-25 10:30:45', 'lte'],
            ['lte', '2026-07-25 10:30:45', 'lte'],
            ['gt', '2026-07-25 10:30:00', 'gt'],
            ['gte', '2026-07-25 10:30:00', 'gte'],
            ['lt', '2026-07-25 10:30:00', 'lt'],
            ['lte', '2026-07-25 10:30:00', 'lte'],
        ];

        foreach ($cases as [$operator, $value, $expectedMinuteOperator]) {
            $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
                new MagicBaseFilterCondition('starts_at', $operator, $value, 'datetime'),
            ]));

            $this->assertSame(
                ['data.starts_at' => ['$' . $expectedMinuteOperator => substr($value, 0, 16)]],
                $compiled['$or'][2]['$and'][1],
            );
        }
    }

    public function testPreservesNullRecordIdValuesInLegacyInFilters(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('id', 'in', [null], 'id'),
        ]));

        $this->assertSame(['record_id' => ['$in' => [null]]], $compiled);
    }

    public function testCompilesEmptyLegacyInFiltersAsNoMatches(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('customer_id', 'in', [], 'number'),
        ]));

        $this->assertSame(['data.customer_id' => ['$in' => []]], $compiled);
    }

    public function testCompilesEmptyOrGroupsAsNoMatches(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();

        $this->assertSame(
            ['record_id' => ['$in' => []]],
            $compiler->compileFilter(new MagicBaseFilterGroup('or', [])),
        );
    }

    public function testCompilesEmptyAndGroupsAsNoFilter(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();

        $this->assertSame([], $compiler->compileFilter(new MagicBaseFilterGroup('and', [])));
    }

    public function testCompilesNumberFiltersWithLegacyStringCompatibility(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('price', 'gte', 1000, 'number'),
        ]));

        $this->assertSame(['data.price' => ['$gte' => 1000]], $compiled['$or'][0]);
        $this->assertSame(['data.price' => ['$type' => 'string']], $compiled['$or'][1]['$and'][0]);
        $this->assertInstanceOf(Regex::class, $compiled['$or'][1]['$and'][1]['data.price']);
        $this->assertSame(
            '$data.price',
            $compiled['$or'][1]['$and'][2]['$expr']['$gte'][0]['$convert']['input'],
        );
        $this->assertSame(
            1000,
            $compiled['$or'][1]['$and'][2]['$expr']['$gte'][1]['$convert']['input'],
        );
    }

    public function testCompilesBooleanFiltersWithLegacyScalarCompatibility(): void
    {
        $compiler = new MagicBaseMongoQueryCompiler();
        $compiled = $compiler->compileFilter(new MagicBaseFilterGroup('and', [
            new MagicBaseFilterCondition('active', 'in', [true, false], 'boolean'),
        ]));

        $this->assertSame([
            'data.active' => ['$in' => [true, 1, '1', false, 0, '0']],
        ], $compiled);
    }
}
