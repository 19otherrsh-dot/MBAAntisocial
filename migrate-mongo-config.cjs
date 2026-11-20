/**
 * Database migrations (migrate-mongo).
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:migrate:status   list applied and pending
 *   npm run db:migrate:create -- <name>
 *
 * Each migration runs once per database and is recorded in the `changelog`
 * collection. Reads the same environment files as the app.
 */
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.MONGODB_URI;
if (!url) throw new Error('MONGODB_URI is not set. Put it in .env.local or the environment.');

module.exports = {
  mongodb: {
    url,
    databaseName: process.env.MONGODB_DB_NAME,
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 300,
  migrationFileExtension: '.cjs',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
