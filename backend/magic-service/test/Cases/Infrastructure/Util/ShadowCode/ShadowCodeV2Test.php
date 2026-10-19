<?php

declare(strict_types=1);

namespace HyperfTest\Cases\Infrastructure\Util\ShadowCode;

use App\Infrastructure\Util\ShadowCode\ShadowCode;
use App\Interfaces\SuperMagic\File\DTO\Request\SaveFileContentRequestDTO;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * 使用跨端合成向量验证 V2 文本承载与旧载荷兼容。
 * @internal
 */
final class ShadowCodeV2Test extends TestCase
{
    /**
     * PHP 编码与前端、Python 读取的共用向量完全一致。
     */
    public function testSharedVectorsRoundTrip(): void
    {
        $vectors = json_decode(file_get_contents(dirname(__DIR__, 6) . '/super-magic/tests/fixtures/shadow_code_vectors.json'), true, 512, JSON_THROW_ON_ERROR);
        foreach ($vectors['valid'] as $vector) {
            self::assertSame($vector['v2'], ShadowCode::shadowV2($vector['plain']));
            self::assertSame($vector['plain'], ShadowCode::unShadow($vector['v2']));
            self::assertTrue(ShadowCode::isShadowed($vector['v2']));
            if ($vector['v1'] !== null) {
                self::assertSame($vector['plain'], ShadowCode::unShadow($vector['v1']));
            }
        }
        self::assertSame('raw 저', ShadowCode::unShadow('raw 저'));
    }

    /**
     * 错误 Base64、未知版本、非法 UTF-8 不得回退为正文。
     */
    public function testInvalidPayloadsAreRejected(): void
    {
        $vectors = json_decode(file_get_contents(dirname(__DIR__, 6) . '/super-magic/tests/fixtures/shadow_code_vectors.json'), true, 512, JSON_THROW_ON_ERROR);
        foreach ($vectors['invalid'] as $payload) {
            self::assertTrue(ShadowCode::isShadowed($payload));
            try {
                ShadowCode::unShadow($payload);
                self::fail('Invalid payload was accepted');
            } catch (InvalidArgumentException $error) {
                self::assertContains($error->getMessage(), ['Invalid shadow payload', 'Unsupported shadow version']);
            }
        }
    }

    /**
     * V2 发送接口只接受有效 UTF-8，不替换非法字节。
     */
    public function testInvalidInputIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        ShadowCode::shadowV2("\xff");
    }

    /**
     * Base64 开销不改变原有 10 MiB 正文容量及请求开关。
     */
    public function testFileSizeLimitAppliesToDecodedBody(): void
    {
        $plain = str_repeat('a', 10 * 1024 * 1024);
        $encoded = ShadowCode::shadowV2($plain);
        $dto = SaveFileContentRequestDTO::fromRequest(['file_id' => 'mock-file', 'content' => $encoded, 'enable_shadow' => true]);
        self::assertSame($encoded, $dto->getContent());
        self::assertTrue($dto->getEnableShadow());

        $raw = 'SHADOWED2_literal';
        $dto = SaveFileContentRequestDTO::fromRequest(['file_id' => 'mock-file', 'content' => $raw, 'enable_shadow' => false]);
        self::assertSame($raw, $dto->getContent());
        self::assertFalse($dto->getEnableShadow());
    }
}
