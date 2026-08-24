<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\Entity;

use App\Infrastructure\ExternalAPI\Sms\Enum\LanguageEnum;

trait ResolvesI18nText
{
    private function resolveI18nText(?array $i18n, string $language): string
    {
        if ($i18n === null) {
            return '';
        }

        $value = $i18n[$language] ?? null;
        if (is_string($value) && $value !== '') {
            return $value;
        }

        $defaultValue = $i18n[LanguageEnum::DEFAULT->value] ?? null;

        return is_string($defaultValue) ? $defaultValue : '';
    }
}
