<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\Provider\DTO\Item;

use App\Domain\Provider\DTO\Item\ModelConfigItem;
use Hyperf\Odin\Constants\ChatApi;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ModelConfigItemTest extends TestCase
{
    public function testChatApiDefaultsToChatCompletions(): void
    {
        $config = new ModelConfigItem();

        $this->assertSame(ChatApi::CHAT_COMPLETIONS, $config->getChatApi());
        $this->assertSame(ChatApi::CHAT_COMPLETIONS, $config->toArray()['chat_api']);
    }

    public function testChatApiAcceptsResponses(): void
    {
        $config = new ModelConfigItem(['chat_api' => ChatApi::RESPONSES]);

        $this->assertSame(ChatApi::RESPONSES, $config->getChatApi());
    }

    public function testChatApiFallsBackOnInvalidValue(): void
    {
        $config = new ModelConfigItem(['chat_api' => 'unknown']);

        $this->assertSame(ChatApi::CHAT_COMPLETIONS, $config->getChatApi());

        $config->setChatApi(null);
        $this->assertSame(ChatApi::CHAT_COMPLETIONS, $config->getChatApi());

        $config->setChatApi('');
        $this->assertSame(ChatApi::CHAT_COMPLETIONS, $config->getChatApi());
    }
}
