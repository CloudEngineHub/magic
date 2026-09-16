<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('magic_assets', static function (Blueprint $table): void {
            if (! Schema::hasColumn('magic_assets', 'owner_uid')) {
                $table->string('owner_uid', 64)->nullable()->after('user_id')->comment('当前归属人用户 ID');
                $table->index(['organization_code', 'owner_uid'], 'idx_asset_org_owner');
            }
            if (! Schema::hasColumn('magic_assets', 'search_text')) {
                $table->text('search_text')->nullable()->after('description_i18n')->comment('名称、描述和标签名称聚合搜索文本');
            }
        });
        if (Schema::hasColumn('magic_assets', 'owner_uid')) {
            Db::table('magic_assets')->whereNull('owner_uid')->whereNotNull('user_id')->update(['owner_uid' => Db::raw('user_id')]);
        }
        if (Schema::hasColumn('magic_assets', 'search_text')) {
            // Backfill the searchable fields for existing rows; tag names are appended by the tag sync service.
            Schema::getConnection()->statement("UPDATE magic_assets SET search_text = TRIM(CONCAT_WS(' ', JSON_UNQUOTE(JSON_EXTRACT(name_i18n, '$.default')), JSON_UNQUOTE(JSON_EXTRACT(description_i18n, '$.default')))) WHERE search_text IS NULL");
        }
    }

    public function down(): void
    {
        Schema::table('magic_assets', static function (Blueprint $table): void {
            if (Schema::hasColumn('magic_assets', 'owner_uid')) {
                $table->dropIndex('idx_asset_org_owner');
                $table->dropColumn('owner_uid');
            }
            if (Schema::hasColumn('magic_assets', 'search_text')) {
                $table->dropColumn('search_text');
            }
        });
    }
};
