<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;

final class SlidesTemplateSearchTextBuilder
{
    /** Build the database exact-search text, including category and tag names. */
    public static function build(
        SlidesTemplateEntity $template,
        ?SlidesTemplateCategoryEntity $category = null,
        array $tags = []
    ): string {
        $values = [];
        $seen = [];

        self::appendText($values, $seen, $template->getCode());
        self::appendText($values, $seen, $template->getSourceType()->value);
        self::appendText($values, $seen, $template->getCategoryCode());
        self::appendI18nTexts($values, $seen, $template->getLabel());
        self::appendI18nTexts($values, $seen, $template->getDescription());
        if ($category !== null) {
            self::appendText($values, $seen, $category->getCode());
            self::appendI18nTexts($values, $seen, $category->getNameI18n());
        }
        foreach ($tags as $tag) {
            if (! $tag instanceof SlidesTemplateTagEntity
                || $tag->getStatus() !== SlidesTemplateTagStatus::Enabled) {
                continue;
            }
            self::appendText($values, $seen, $tag->getCode());
            self::appendI18nTexts($values, $seen, $tag->getNameI18n());
        }

        return implode(' ', $values);
    }

    /**
     * @param array<int, string> $values
     * @param array<string, bool> $seen
     */
    private static function appendText(array &$values, array &$seen, ?string $text): void
    {
        $normalized = self::normalizeText($text);
        if ($normalized === null || isset($seen[$normalized])) {
            return;
        }

        $seen[$normalized] = true;
        $values[] = $normalized;
    }

    /**
     * @param array<int, string> $values
     * @param array<string, bool> $seen
     * @param array<mixed> $i18nTexts
     */
    private static function appendI18nTexts(array &$values, array &$seen, array $i18nTexts): void
    {
        foreach ($i18nTexts as $text) {
            if (! is_string($text)) {
                continue;
            }

            self::appendText($values, $seen, $text);
        }
    }

    /** Normalize case and whitespace so duplicate search terms are stored once. */
    private static function normalizeText(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }

        $text = trim($text);
        if ($text === '') {
            return null;
        }

        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
        return mb_strtolower($text, 'UTF-8');
    }
}
