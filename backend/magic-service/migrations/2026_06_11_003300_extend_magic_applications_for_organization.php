<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    private const string ORGANIZATION_SOURCE_INDEX = 'idx_magic_applications_org_source';

    public function up(): void
    {
        if (! Schema::hasTable('magic_applications')) {
            return;
        }

        $hasOrganizationCode = Schema::hasColumn('magic_applications', 'organization_code');
        $hasSourceType = Schema::hasColumn('magic_applications', 'source_type');
        $hasOrganizationSourceIndex = $this->hasIndex('magic_applications', self::ORGANIZATION_SOURCE_INDEX);

        Schema::table('magic_applications', static function (Blueprint $table) use ($hasOrganizationCode, $hasSourceType, $hasOrganizationSourceIndex) {
            if (! $hasOrganizationCode) {
                $table->string('organization_code', 50)->default('')->after('id')->comment('组织编码，官方菜单为官方组织编码');
            }

            if (! $hasSourceType) {
                $table->tinyInteger('source_type')->default(AppMenuSourceType::Official->value)->after('organization_code')->comment('来源类型: 1-官方, 2-组织自建');
            }

            if (! $hasOrganizationSourceIndex) {
                $table->index(['organization_code', 'source_type'], self::ORGANIZATION_SOURCE_INDEX);
            }
        });

        $officialOrganizationCode = (string) config('service_provider.office_organization', '');
        if ($officialOrganizationCode !== '') {
            Db::table('magic_applications')
                ->where(function ($query): void {
                    $query->whereNull('organization_code')
                        ->orWhere('organization_code', '');
                })
                ->update([
                    'organization_code' => $officialOrganizationCode,
                    'source_type' => AppMenuSourceType::Official->value,
                ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_applications')) {
            return;
        }

        $hasOrganizationSourceIndex = $this->hasIndex('magic_applications', self::ORGANIZATION_SOURCE_INDEX);

        Schema::table('magic_applications', static function (Blueprint $table) use ($hasOrganizationSourceIndex) {
            if ($hasOrganizationSourceIndex) {
                $table->dropIndex(self::ORGANIZATION_SOURCE_INDEX);
            }

            if (Schema::hasColumn('magic_applications', 'source_type')) {
                $table->dropColumn('source_type');
            }

            if (Schema::hasColumn('magic_applications', 'organization_code')) {
                $table->dropColumn('organization_code');
            }
        });
    }

    private function hasIndex(string $tableName, string $indexName): bool
    {
        $rows = Db::select(
            'select count(*) as index_count from information_schema.STATISTICS where table_schema = database() and table_name = ? and index_name = ?',
            [$tableName, $indexName]
        );

        $first = $rows[0] ?? null;
        if (is_array($first)) {
            return (int) ($first['index_count'] ?? 0) > 0;
        }

        return (int) ($first->index_count ?? 0) > 0;
    }
};
