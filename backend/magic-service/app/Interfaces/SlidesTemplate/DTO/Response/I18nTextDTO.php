<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use JsonSerializable;

class I18nTextDTO implements JsonSerializable
{
    private string $zhCN = '';

    private string $enUS = '';

    public function __construct(string $zhCN = '', string $enUS = '')
    {
        $this->setZhCN($zhCN);
        $this->setEnUS($enUS);
    }

    public static function fromArray(array $data): self
    {
        return new self((string) ($data['zh_CN'] ?? ''), (string) ($data['en_US'] ?? ''));
    }

    public function getZhCN(): string
    {
        return $this->zhCN;
    }

    public function setZhCN(?string $zhCN): void
    {
        $this->zhCN = $zhCN ?? '';
    }

    public function getEnUS(): string
    {
        return $this->enUS;
    }

    public function setEnUS(?string $enUS): void
    {
        $this->enUS = $enUS ?? '';
    }

    public function jsonSerialize(): array
    {
        return [
            'zh_CN' => $this->getZhCN(),
            'en_US' => $this->getEnUS(),
        ];
    }
}
