<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnIndex;
use App\Domain\MagicBase\Service\MagicBaseRowDomainService;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class MagicBaseRowDomainServiceTest extends TestCase
{
    public function testNormalizesNumberAndBooleanValuesBeforeTheyReachRowStorage(): void
    {
        $priceColumn = $this->createMock(MagicBaseColumnEntity::class);
        $priceColumn->method('getColumnKey')->willReturn('price');
        $priceColumn->method('getDataType')->willReturn('number');
        $priceColumn->method('getIsRequired')->willReturn(false);

        $activeColumn = $this->createMock(MagicBaseColumnEntity::class);
        $activeColumn->method('getColumnKey')->willReturn('active');
        $activeColumn->method('getDataType')->willReturn('boolean');
        $activeColumn->method('getIsRequired')->willReturn(false);

        $normalized = (new MagicBaseRowDomainService())->normalizeRowPayload([
            'price' => '5999',
            'active' => '0',
        ], new MagicBaseColumnIndex([
            'price' => $priceColumn,
            'active' => $activeColumn,
        ]), true);

        $this->assertSame(5999, $normalized['price']);
        $this->assertFalse($normalized['active']);
    }

    public function testNormalizesDatetimeValuesBeforeTheyReachRowStorage(): void
    {
        $column = $this->createMock(MagicBaseColumnEntity::class);
        $column->method('getColumnKey')->willReturn('starts_at');
        $column->method('getDataType')->willReturn('datetime');
        $column->method('getIsRequired')->willReturn(false);
        $service = new MagicBaseRowDomainService();

        $normalized = $service->normalizeRowPayload([
            'starts_at' => '2026-07-25T10:30',
        ], new MagicBaseColumnIndex(['starts_at' => $column]), true);

        $this->assertSame('2026-07-25 10:30:00', $normalized['starts_at']);
    }

    public function testNormalizesIso8601DatetimeValuesBeforeTheyReachRowStorage(): void
    {
        $column = $this->createMock(MagicBaseColumnEntity::class);
        $column->method('getColumnKey')->willReturn('starts_at');
        $column->method('getDataType')->willReturn('datetime');
        $column->method('getIsRequired')->willReturn(false);
        $service = new MagicBaseRowDomainService();

        $normalized = $service->normalizeRowPayload([
            'starts_at' => '2026-08-04T03:12:18.582Z',
        ], new MagicBaseColumnIndex(['starts_at' => $column]), true);

        $this->assertSame('2026-08-04 11:12:18', $normalized['starts_at']);
    }

    public function testNormalizesDatetimeDefaultValuesBeforeTheyReachRowStorage(): void
    {
        $column = $this->createMock(MagicBaseColumnEntity::class);
        $column->method('getColumnKey')->willReturn('starts_at');
        $column->method('getDataType')->willReturn('datetime');
        $column->method('getIsRequired')->willReturn(false);
        $column->method('getDefaultValue')->willReturn('2026-07-25T10:30');
        $service = new MagicBaseRowDomainService();

        $normalized = $service->normalizeRowPayload(
            [],
            new MagicBaseColumnIndex(['starts_at' => $column]),
            true,
        );

        $this->assertSame('2026-07-25 10:30:00', $normalized['starts_at']);
    }
}
