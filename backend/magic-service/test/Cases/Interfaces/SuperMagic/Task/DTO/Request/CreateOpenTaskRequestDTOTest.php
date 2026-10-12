<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\SuperMagic\Task\DTO\Request;

use App\Interfaces\SuperMagic\Task\DTO\Request\CreateOpenTaskRequestDTO;
use Hyperf\Contract\TranslatorInterface;
use Hyperf\Validation\ValidatorFactory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * @internal
 */
final class CreateOpenTaskRequestDTOTest extends TestCase
{
    #[DataProvider('autoHireValues')]
    public function testAutoHireValidationAndDefault(array $options, bool $valid, ?bool $expected): void
    {
        $data = array_merge(['project_id' => '1', 'topic_id' => '2', 'content' => 'Analyze sales'], $options);
        $translator = $this->createMock(TranslatorInterface::class);
        $translator->method('trans')->willReturnCallback(static fn (string $key) => $key);
        $rules = (new ReflectionMethod(CreateOpenTaskRequestDTO::class, 'getHyperfValidationRules'))->invoke(null);
        $validator = (new ValidatorFactory($translator))->make($data, $rules);
        self::assertSame($valid, $validator->passes());
        if ($valid) {
            self::assertSame($expected, (new CreateOpenTaskRequestDTO($data))->isAutoHireAgent());
        }
    }

    public static function autoHireValues(): array
    {
        return [
            'omitted' => [[], true, false],
            'disabled' => [['auto_hire_agent' => false], true, false],
            'enabled' => [['auto_hire_agent' => true], true, true],
            'integer enabled' => [['auto_hire_agent' => 1], true, true],
            'integer disabled' => [['auto_hire_agent' => 0], true, false],
            'string enabled' => [['auto_hire_agent' => '1'], true, true],
            'string disabled' => [['auto_hire_agent' => '0'], true, false],
            'invalid integer' => [['auto_hire_agent' => 2], false, null],
            'null' => [['auto_hire_agent' => null], false, null],
            'string' => [['auto_hire_agent' => 'false'], false, null],
            'array' => [['auto_hire_agent' => []], false, null],
        ];
    }

    public function testAutoHireRemainsOutsideTheAgentMessage(): void
    {
        $dto = new CreateOpenTaskRequestDTO([
            'project_id' => '1', 'topic_id' => '2', 'content' => 'Analyze sales',
            'agent_mode' => 'SMA-sales', 'auto_hire_agent' => true,
        ]);
        $content = $dto->toCreateTaskRequestDTO()->getMessageContent();
        self::assertSame('SMA-sales', $content['extra']['super_agent']['topic_pattern']);
        self::assertArrayNotHasKey('auto_hire_agent', $content['extra']['super_agent']);
    }
}
