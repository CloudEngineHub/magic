<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_super_magic_agent_category_relations')) {
            Schema::create('magic_super_magic_agent_category_relations', static function (Blueprint $table) {
                $table->bigInteger('id')->comment('主键 ID，雪花 ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->string('relation_type', 32)->comment('关联类型：AGENT_VERSION=Agent版本，AGENT_MARKET=Agent市场记录');
                $table->bigInteger('relation_id')->comment('关联对象 ID');
                $table->bigInteger('category_id')->comment('分类 ID，对应 magic_super_magic_agent_categories.id');
                $table->timestamps();
                $table->softDeletes();

                $table->primary('id');
                $table->unique(['relation_type', 'relation_id', 'category_id'], 'uk_type_relation_category');
                $table->index(['relation_type', 'category_id'], 'idx_type_category');
                $table->index(['relation_type', 'category_id', 'relation_id'], 'idx_type_category_relation');
                $table->index(['category_id'], 'idx_category');
                $table->index(['organization_code', 'relation_type', 'relation_id'], 'idx_org_type_relation');
            });
        }

        $this->backfillVersionCategories();
        $this->backfillMarketCategories();
    }

    public function down(): void
    {
    }

    private function backfillVersionCategories(): void
    {
        if (! Schema::hasTable('magic_super_magic_agent_versions')
            || ! Schema::hasColumn('magic_super_magic_agent_versions', 'category_id')) {
            return;
        }

        $rows = Db::table('magic_super_magic_agent_versions')
            ->select(['id', 'organization_code', 'category_id'])
            ->whereNotNull('category_id')
            ->whereNull('deleted_at')
            ->get();

        foreach ($rows as $row) {
            $this->insertIgnoreRelation(
                'AGENT_VERSION',
                (int) $this->getRowValue($row, 'id'),
                (int) $this->getRowValue($row, 'category_id'),
                (string) $this->getRowValue($row, 'organization_code')
            );
        }
    }

    private function backfillMarketCategories(): void
    {
        if (! Schema::hasTable('magic_super_magic_agent_market')
            || ! Schema::hasColumn('magic_super_magic_agent_market', 'category_id')) {
            return;
        }

        $rows = Db::table('magic_super_magic_agent_market')
            ->select(['id', 'organization_code', 'category_id'])
            ->whereNotNull('category_id')
            ->whereNull('deleted_at')
            ->get();

        foreach ($rows as $row) {
            $this->insertIgnoreRelation(
                'AGENT_MARKET',
                (int) $this->getRowValue($row, 'id'),
                (int) $this->getRowValue($row, 'category_id'),
                (string) $this->getRowValue($row, 'organization_code')
            );
        }
    }

    private function insertIgnoreRelation(string $relationType, int $relationId, int $categoryId, string $organizationCode): void
    {
        Db::table('magic_super_magic_agent_category_relations')->insertOrIgnore([
            'id' => IdGenerator::getSnowId(),
            'organization_code' => $organizationCode,
            'relation_type' => $relationType,
            'relation_id' => $relationId,
            'category_id' => $categoryId,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);
    }

    private function getRowValue(array|object $row, string $key): mixed
    {
        return is_array($row) ? $row[$key] : $row->{$key};
    }
};
