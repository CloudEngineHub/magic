<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit;

use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ValueObject\AssetSyncStatus;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Asset\Assembler\AssetAssembler;
use App\Interfaces\Asset\DTO\Response\AssetDTO;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class AssetAssemblerTest extends TestCase
{
    public function testAssetResponseIsAFieldBasedDto(): void
    {
        $dto = AssetAssembler::createItem(new AssetEntity([
            'id' => 1,
            'asset_kind' => 'ASSET',
            'asset_business_type' => 'CHARACTER',
            'name_i18n' => ['default' => '角色'],
            'file_key' => 'character.png',
        ]));

        self::assertInstanceOf(AssetDTO::class, $dto);
        // 雪花 ID 以字符串返回，避免前端精度丢失。
        self::assertSame('1', $dto->getAssetId());
        self::assertSame('CHARACTER', $dto->getAssetBusinessType());
        self::assertSame('角色', $dto->getName());
    }

    public function testAssetListSerializesNestedDtos(): void
    {
        $response = AssetAssembler::createList(
            [new AssetEntity(['id' => 1, 'name_i18n' => ['default' => '角色']])],
            new Page(1, 10),
            1,
        )->toArray();

        self::assertSame('1', $response['list'][0]['asset_id']);
        self::assertSame('角色', $response['list'][0]['name']);
    }

    public function testComplianceStatusIsDerivedFromSyncStatus(): void
    {
        // 已同步的素材即合规校验通过，不暴露失败原因。
        $passed = AssetAssembler::createItem(new AssetEntity([
            'id' => 1,
            'asset_kind' => 'ASSET',
            'sync_status' => AssetSyncStatus::SYNCED->value,
            'sync_failed_reason' => '不该展示',
        ]));
        self::assertSame('PASSED', $passed->getComplianceStatus());
        self::assertNull($passed->getComplianceFailedReason());

        // 校验失败必须带上原因，前端要能直接展示。
        $failed = AssetAssembler::createItem(new AssetEntity([
            'id' => 2,
            'asset_kind' => 'ASSET',
            'sync_status' => AssetSyncStatus::FAILED->value,
            'sync_failed_reason' => '内容涉嫌违规',
        ]));
        self::assertSame('FAILED', $failed->getComplianceStatus());
        self::assertSame('内容涉嫌违规', $failed->getComplianceFailedReason());

        // 还没有结论（未提交 / 审核中）一律算「未校验」。
        $syncing = AssetAssembler::createItem(new AssetEntity([
            'id' => 3,
            'asset_kind' => 'ASSET',
            'sync_status' => AssetSyncStatus::SYNCING->value,
        ]));
        self::assertSame('UNVERIFIED', $syncing->getComplianceStatus());
        self::assertNull($syncing->getComplianceFailedReason());

        // 素材组只是本地层级、不参与第三方合规校验，即便本地是 SYNCED 也算未校验。
        $group = AssetAssembler::createItem(new AssetEntity([
            'id' => 4,
            'asset_kind' => 'GROUP',
            'sync_status' => AssetSyncStatus::SYNCED->value,
        ]));
        self::assertSame('UNVERIFIED', $group->getComplianceStatus());
    }

    public function testComplianceFieldsAppearInSerializedList(): void
    {
        $response = AssetAssembler::createList(
            [new AssetEntity([
                'id' => 1,
                'asset_kind' => 'ASSET',
                'sync_status' => AssetSyncStatus::FAILED->value,
                'sync_failed_reason' => '内容涉嫌违规',
            ])],
            new Page(1, 10),
            1,
        )->toArray();

        self::assertSame('FAILED', $response['list'][0]['compliance_status']);
        self::assertSame('内容涉嫌违规', $response['list'][0]['compliance_failed_reason']);
    }
}
