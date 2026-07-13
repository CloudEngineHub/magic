<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Official;

use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;
use RuntimeException;
use Throwable;

use function Hyperf\Support\now;

class SlidesTemplateTagInitializer
{
    private const string SYSTEM_UID = 'system';

    private const string VOCABULARY_FILE = BASE_PATH . '/storage/slides-template/tag-vocabulary/slides_template_tag_vocabulary.json';

    /**
     * @return array{success: bool, message: string, count: int, groups: int, tags: int}
     */
    public static function init(): array
    {
        $officialOrgCode = config('service_provider.office_organization', '');
        if ($officialOrgCode === '') {
            return [
                'success' => false,
                'message' => 'Official organization code not configured in service_provider.office_organization',
                'count' => 0,
                'groups' => 0,
                'tags' => 0,
            ];
        }

        if (! self::isTableReady()) {
            return [
                'success' => false,
                'message' => 'magic_slides_template_tags table or hierarchy fields are not ready',
                'count' => 0,
                'groups' => 0,
                'tags' => 0,
            ];
        }

        $now = now();

        try {
            $vocabulary = self::loadVocabulary();

            Db::beginTransaction();

            $groupRows = self::buildGroupRows($officialOrgCode, $vocabulary['groups'], $now);
            self::upsertTagNodes($groupRows);
            $groupIds = self::findIdsByCodes(array_column($groupRows, 'code'));

            $tagRows = self::buildTagRows($officialOrgCode, $vocabulary['tags'], $groupIds, $now);
            self::upsertTagNodes($tagRows);
            self::deleteObsoleteDetailNodes($officialOrgCode);

            Db::commit();
        } catch (Throwable $throwable) {
            Db::rollBack();
            return [
                'success' => false,
                'message' => 'Failed to initialize slides template tags: ' . $throwable->getMessage(),
                'count' => 0,
                'groups' => 0,
                'tags' => 0,
            ];
        }

        return [
            'success' => true,
            'message' => sprintf('Successfully initialized slides template tags: %d groups, %d tags.', count($groupRows), count($tagRows)),
            'count' => count($groupRows) + count($tagRows),
            'groups' => count($groupRows),
            'tags' => count($tagRows),
        ];
    }

    /**
     * @return array{groups: array<int, array<string, mixed>>, tags: array<int, array<string, mixed>>}
     */
    private static function loadVocabulary(): array
    {
        $content = file_get_contents(self::VOCABULARY_FILE);
        if ($content === false) {
            throw new RuntimeException('Slides template tag vocabulary file not found');
        }

        $vocabulary = json_decode($content, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($vocabulary) || ! isset($vocabulary['groups'], $vocabulary['tags'])) {
            throw new RuntimeException('Slides template tag vocabulary file format is invalid');
        }

        return $vocabulary;
    }

    private static function isTableReady(): bool
    {
        if (! Schema::hasTable('magic_slides_template_tags')) {
            return false;
        }

        foreach (['parent_id', 'node_type', 'description_i18n'] as $column) {
            if (! Schema::hasColumn('magic_slides_template_tags', $column)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param array<int, array<string, mixed>> $groups
     * @return array<int, array<string, mixed>>
     */
    private static function buildGroupRows(string $organizationCode, array $groups, mixed $now): array
    {
        $rows = [];
        foreach ($groups as $group) {
            $rows[] = [
                'id' => IdGenerator::getSnowId(),
                'organization_code' => $organizationCode,
                'parent_id' => 0,
                'node_type' => 'group',
                'code' => $group['code'],
                'name_i18n' => json_encode($group['name_i18n'], JSON_UNESCAPED_UNICODE),
                'description_i18n' => json_encode([], JSON_UNESCAPED_UNICODE),
                'status' => 1,
                'sort' => $group['sort'],
                'created_uid' => self::SYSTEM_UID,
                'updated_uid' => self::SYSTEM_UID,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
            ];
        }

        return $rows;
    }

    /**
     * @param array<int, array<string, mixed>> $tags
     * @param array<string, int> $groupIds
     * @return array<int, array<string, mixed>>
     */
    private static function buildTagRows(string $organizationCode, array $tags, array $groupIds, mixed $now): array
    {
        $rows = [];
        foreach ($tags as $tag) {
            $groupId = $groupIds[$tag['group_code']] ?? null;
            if ($groupId === null) {
                throw new RuntimeException("Slides template tag group {$tag['group_code']} not initialized");
            }

            $rows[] = [
                'id' => IdGenerator::getSnowId(),
                'organization_code' => $organizationCode,
                'parent_id' => $groupId,
                'node_type' => 'tag',
                'code' => $tag['code'],
                'name_i18n' => json_encode($tag['name_i18n'], JSON_UNESCAPED_UNICODE),
                'description_i18n' => json_encode([], JSON_UNESCAPED_UNICODE),
                'status' => 1,
                'sort' => $tag['sort'],
                'created_uid' => self::SYSTEM_UID,
                'updated_uid' => self::SYSTEM_UID,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
            ];
        }

        return $rows;
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     */
    private static function upsertTagNodes(array $rows): void
    {
        foreach (array_chunk($rows, 200) as $chunk) {
            Db::table('magic_slides_template_tags')->upsert(
                $chunk,
                ['code'],
                [
                    'organization_code',
                    'parent_id',
                    'node_type',
                    'name_i18n',
                    'description_i18n',
                    'status',
                    'sort',
                    'updated_uid',
                    'updated_at',
                    'deleted_at',
                ]
            );
        }
    }

    private static function deleteObsoleteDetailNodes(string $organizationCode): void
    {
        $rows = Db::table('magic_slides_template_tags')
            ->where('organization_code', $organizationCode)
            ->where(static function ($query): void {
                $query->where('code', 'like', 'detail-%')
                    ->orWhere(static function ($query): void {
                        $query->where('node_type', 'group')
                            ->where('code', 'like', '%detail%');
                    });
            })
            ->get(['id']);

        $ids = [];
        foreach ($rows as $row) {
            $ids[] = (int) ((array) $row)['id'];
        }

        foreach (array_chunk($ids, 200) as $chunk) {
            Db::table('magic_slides_template_tag_relations')
                ->whereIn('tag_id', $chunk)
                ->delete();
            Db::table('magic_slides_template_tags')
                ->whereIn('id', $chunk)
                ->delete();
        }
    }

    /**
     * @param string[] $codes
     * @return array<string, int>
     */
    private static function findIdsByCodes(array $codes): array
    {
        $rows = Db::table('magic_slides_template_tags')
            ->whereIn('code', $codes)
            ->get(['id', 'code']);

        $ids = [];
        foreach ($rows as $row) {
            $data = (array) $row;
            $ids[(string) $data['code']] = (int) $data['id'];
        }

        return $ids;
    }
}
