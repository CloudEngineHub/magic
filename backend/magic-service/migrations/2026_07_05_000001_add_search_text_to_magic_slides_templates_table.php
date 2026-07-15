<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Service\SlidesTemplateSearchTextBuilder;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_slides_templates')) {
            return;
        }

        if (! Schema::hasColumn('magic_slides_templates', 'search_text')) {
            Schema::table('magic_slides_templates', static function (Blueprint $table): void {
                $table->text('search_text')
                    ->nullable()
                    ->after('description')
                    ->comment('统一小写搜索字段，聚合模板编码、来源、名称和描述');
            });
        }

        $this->refreshExistingSearchText();
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_slides_templates') || ! Schema::hasColumn('magic_slides_templates', 'search_text')) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table): void {
            $table->dropColumn('search_text');
        });
    }

    private function refreshExistingSearchText(): void
    {
        $templates = Db::table('magic_slides_templates')
            ->select(['id', 'code', 'source_type', 'label', 'description'])
            ->get();

        foreach ($templates as $template) {
            Db::table('magic_slides_templates')
                ->where('id', $this->getValue($template, 'id'))
                ->update([
                    'search_text' => $this->buildSearchText($template),
                ]);
        }
    }

    private function buildSearchText(array|object $template): string
    {
        $entity = new SlidesTemplateEntity();
        $entity->setCode((string) $this->getValue($template, 'code'))
            ->setSourceType((string) $this->getValue($template, 'source_type'))
            ->setLabel($this->decodeJsonArray($this->getValue($template, 'label')))
            ->setDescription($this->decodeJsonArray($this->getValue($template, 'description')));

        return SlidesTemplateSearchTextBuilder::build($entity);
    }

    private function getValue(array|object $row, string $key): mixed
    {
        if (is_array($row)) {
            return $row[$key] ?? null;
        }

        return $row->{$key} ?? null;
    }

    /**
     * @return array<mixed>
     */
    private function decodeJsonArray(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }
};
