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
            $table->string('visibility_type', 16)->default('PERSONAL')->comment('可见范围：PERSONAL 仅自己可见，TEAM 团队可见');
            $table->index(['organization_code', 'owner_uid', 'visibility_type', 'status'], 'idx_asset_visibility_query');
        });

        // 历史上除归属人本人外还存在其它授权主体的素材，迁移为团队可见。
        Db::statement(<<<'SQL'
UPDATE magic_assets AS a
SET visibility_type = 'TEAM'
WHERE EXISTS (
    SELECT 1
    FROM magic_resource_visibility AS rv
    WHERE rv.organization_code = a.organization_code
      AND rv.resource_type = 5
      AND rv.resource_code = CAST(a.id AS CHAR)
      AND (
          rv.principal_type <> 1
          OR rv.principal_id <> COALESCE(a.owner_uid, a.user_id, '')
      )
)
SQL);
    }

    public function down(): void
    {
        Schema::table('magic_assets', static function (Blueprint $table): void {
            $table->dropIndex('idx_asset_visibility_query');
            $table->dropColumn('visibility_type');
        });
    }
};
