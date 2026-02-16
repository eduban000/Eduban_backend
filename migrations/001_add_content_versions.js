/**
 * Migration: Add Content Versions Support
 * Version: 001_add_content_versions.js
 * Description: Adds tables and indexes for content version control functionality
 */

exports.up = async function(knex) {
  // Create content_versions table
  await knex.schema.createTable('content_versions', function(table) {
    table.string('id').primary().comment('Unique version identifier');
    table.string('content_id').notNullable().comment('Reference to content');
    table.integer('version').notNullable().comment('Version number');
    table.string('title').notNullable().comment('Version title');
    table.text('description').notNullable().comment('Version description');
    table.json('content').notNullable().comment('Version content data');
    table.json('media_files').defaultTo('[]').comment('Media files for this version');
    table.json('changes').notNullable().comment('Array of changes in this version');
    table.string('created_by').notNullable().comment('User who created this version');
    table.timestamp('created_at').defaultTo(knex.fn.now()).comment('Creation timestamp');
    table.boolean('is_current').defaultTo(false).comment('Whether this is current version');
    table.timestamp('published_at').nullable().comment('Publication timestamp');
    
    // Indexes for performance
    table.index(['content_id'], 'idx_content_versions_content_id');
    table.index(['content_id', 'version'], 'idx_content_versions_content_version');
    table.index(['content_id', 'is_current'], 'idx_content_versions_current');
    table.index(['created_by'], 'idx_content_versions_created_by');
    table.index(['created_at'], 'idx_content_versions_created_at');
    
    // Unique constraint to prevent duplicate versions
    table.unique(['content_id', 'version'], 'uq_content_versions_content_version');
  });

  // Add version tracking fields to existing content table
  await knex.schema.alterTable('content', function(table) {
    table.integer('current_version').defaultTo(1).comment('Current version number');
    table.timestamp('last_version_update').nullable().comment('Last version update time');
    table.boolean('auto_versioning').defaultTo(true).comment('Enable automatic versioning');
    table.integer('max_versions').defaultTo(0).comment('Max versions to keep (0=unlimited)');
    
    // Indexes
    table.index(['current_version'], 'idx_content_current_version');
    table.index(['auto_versioning'], 'idx_content_auto_versioning');
  });

  // Create version_comparison_cache table
  await knex.schema.createTable('version_comparison_cache', function(table) {
    table.string('id').primary();
    table.string('content_id').notNullable();
    table.integer('version1').notNullable();
    table.integer('version2').notNullable();
    table.json('comparison_data').notNullable().comment('Cached comparison result');
    table.timestamp('cached_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable().comment('Cache expiration time');
    
    // Indexes
    table.index(['content_id', 'version1', 'version2'], 'idx_version_comparison_lookup');
    table.index(['expires_at'], 'idx_version_comparison_expires');
  });

  // Create version_restore_history table
  await knex.schema.createTable('version_restore_history', function(table) {
    table.string('id').primary();
    table.string('content_id').notNullable();
    table.string('restored_from_version_id').notNullable();
    table.integer('restored_from_version_number').notNullable();
    table.string('restored_by').notNullable();
    table.text('restore_reason').nullable();
    table.timestamp('restored_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['content_id'], 'idx_version_restore_content');
    table.index(['restored_by'], 'idx_version_restore_user');
    table.index(['restored_at'], 'idx_version_restore_date');
  });

  // Create version_settings table for content-specific settings
  await knex.schema.createTable('version_settings', function(table) {
    table.string('content_id').primary().comment('Content ID (primary key)');
    table.boolean('auto_versioning').defaultTo(true).comment('Enable automatic versioning');
    table.integer('max_versions').defaultTo(0).comment('Max versions to keep (0=unlimited)');
    table.json('custom_settings').nullable().comment('Custom version control settings');
    table.timestamp('created_at').defaultTo(knex.fn.now()).comment('Creation timestamp');
    table.timestamp('updated_at').defaultTo(knex.fn.now()).comment('Last update timestamp');
    
    // Indexes
    table.index(['auto_versioning'], 'idx_version_settings_auto_versioning');
  });

  // Insert default version control settings
  await knex('version_settings').insert([
    {
      content_id: 'default_version_settings',
      max_versions: 50,
      auto_cleanup_old_versions: true,
      cleanup_retention_days: 365,
      enable_comparison_cache: true,
      cache_expiry_hours: 24,
      require_change_description: true,
      enable_auto_versioning: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Create initial versions for existing content
  await knex.raw(`
    INSERT INTO content_versions (
      id, content_id, version, title, description, content, 
      media_files, changes, created_by, is_current, created_at
    )
    SELECT 
      CONCAT('ver_', id, '_initial'),
      id as content_id,
      1 as version,
      title,
      description,
      content,
      COALESCE(media_files, '[]'),
      JSON_ARRAY('Initial version created during migration') as changes,
      created_by,
      true as is_current,
      created_at
    FROM content 
    WHERE id NOT IN (SELECT DISTINCT content_id FROM content_versions)
  `);

  // Update content table with current version information
  await knex.raw(`
    UPDATE content 
    SET 
      current_version = 1,
      last_version_update = created_at,
      auto_versioning = true,
      max_versions = 0
    WHERE id IN (SELECT DISTINCT content_id FROM content_versions)
  `);

  // Insert version settings for existing content
  await knex.raw(`
    INSERT INTO version_settings (content_id, auto_versioning, max_versions, created_at, updated_at)
    SELECT id, true, 0, NOW(), NOW() FROM content 
    WHERE id NOT IN (SELECT content_id FROM version_settings)
  `);
};

exports.down = async function(knex) {
  // Drop version control tables in reverse order
  await knex.schema.dropTableIfExists('version_restore_history');
  await knex.schema.dropTableIfExists('version_comparison_cache');
  await knex.schema.dropTableIfExists('version_settings');
  
  // Remove version tracking fields from content table
  await knex.schema.alterTable('content', function(table) {
    table.dropColumn('current_version');
    table.dropColumn('last_version_update');
    table.dropColumn('auto_versioning');
    table.dropColumn('max_versions');
  });
  
  // Drop content_versions table
  await knex.schema.dropTableIfExists('content_versions');
  
  // Clean up version settings
  await knex('version_settings').where('id', 'default_version_settings').del();
};

// Helper functions for data migration
exports.helpers = {
  /**
   * Create initial version for content that doesn't have versions
   */
  createInitialVersions: async function(knex, contentIds) {
    for (const contentId of contentIds) {
      const content = await knex('content').where('id', contentId).first();
      if (content) {
        await knex('content_versions').insert({
          id: `ver_${contentId}_initial`,
          content_id: contentId,
          version: 1,
          title: content.title,
          description: content.description,
          content: content.content,
          media_files: content.media_files || '[]',
          changes: JSON.stringify(['Initial version created during migration']),
          created_by: content.created_by,
          is_current: true,
          created_at: content.created_at
        });
      }
    }
  },

  /**
   * Migrate existing content to new version structure
   */
  migrateExistingContent: async function(knex) {
    const existingContent = await knex('content').select('id');
    const contentIds = existingContent.map(c => c.id);
    
    if (contentIds.length > 0) {
      await this.createInitialVersions(knex, contentIds);
    }
  },

  /**
   * Validate migration integrity
   */
  validateMigration: async function(knex) {
    const issues = [];
    
    // Check if all content has version settings
    const contentWithoutSettings = await knex('content')
      .leftJoin('version_settings', 'content.id', 'version_settings.content_id')
      .where('version_settings.content_id', null)
      .count('* as count');
    
    if (contentWithoutSettings[0].count > 0) {
      issues.push(`${contentWithoutSettings[0].count} content items missing version settings`);
    }
    
    // Check if all content has at least one version
    const contentWithoutVersions = await knex('content')
      .leftJoin('content_versions', 'content.id', 'content_versions.content_id')
      .where('content_versions.content_id', null)
      .count('* as count');
    
    if (contentWithoutVersions[0].count > 0) {
      issues.push(`${contentWithoutVersions[0].count} content items missing versions`);
    }
    
    // Check for duplicate current versions
    const duplicateCurrentVersions = await knex('content_versions')
      .select('content_id')
      .where('is_current', true)
      .groupBy('content_id')
      .havingRaw('COUNT(*) > 1');
    
    if (duplicateCurrentVersions.length > 0) {
      issues.push(`${duplicateCurrentVersions.length} content items have multiple current versions`);
    }
    
    return issues;
  }
};
