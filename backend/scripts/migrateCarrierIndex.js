/**
 * DEPRECATED — This script is superseded by migrateCarrierCategoryToArray.js
 *
 * The carrier `category` field is now an array (multi-category support).
 * The unique index is on `name` only, not `name + category`.
 *
 * Run instead:  node backend/scripts/migrateCarrierCategoryToArray.js
 */

console.log('⚠️  This migration is DEPRECATED.');
console.log('   Carrier category is now an array. The unique index is on { name: 1 } only.');
console.log('   Run instead: node backend/scripts/migrateCarrierCategoryToArray.js');
process.exit(0);
