<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit;

use App\Domain\Asset\Entity\AssetEntity;
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
}
