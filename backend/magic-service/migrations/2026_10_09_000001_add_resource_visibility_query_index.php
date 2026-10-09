<?php

declare(strict_types=1);

use HyperfDatabaseMigrationsMigration;
use HyperfDatabaseSchemaBlueprint;
use HyperfDatabaseSchemaSchema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('magic_resource_visibility', static function (Blueprint $table): void {
            $table->index(
                ['organization_code', 'resource_type', 'resource_code'],
                'idx_resource_visibility_resource_query'
            );
        });
    }

    public function down(): void
    {
        Schema::table('magic_resource_visibility', static function (Blueprint $table): void {
            $table->dropIndex('idx_resource_visibility_resource_query');
        });
    }
};
