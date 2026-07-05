/**
 * Migration: Add Newsletter Subscribers
 * Description: Creates newsletter_subscribers table for email subscription management.
 * Version: 003
 */

exports.up = async function (knex) {
    await knex.schema.createTable('newsletter_subscribers', function (table) {
        table.string('id').primary().comment('Unique subscriber identifier');
        table.string('email').notNullable().unique().comment('Subscriber email address');
        table.string('unsubscribe_token').notNullable().unique().comment('Token for unsubscribe link');
        table.boolean('is_active').defaultTo(true).comment('Whether subscription is active');
        table.timestamp('subscribed_at').defaultTo(knex.fn.now()).comment('Subscription timestamp');
        table.timestamp('unsubscribed_at').nullable().comment('Unsubscription timestamp');
    });    
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('newsletter_subscribers');
};