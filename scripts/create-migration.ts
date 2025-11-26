#!/usr/bin/env node
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { PATHS, MIGRATION_TEMPLATE } from './config.js';

async function createMigration(name: string) {
  // Ensure migrations directory exists
  await mkdir(PATHS.MIGRATIONS_DIR, { recursive: true });
  
  // Create migration filename with timestamp
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];
  
  const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.ts`;
  const filepath = join(PATHS.MIGRATIONS_DIR, filename);
  
  // Create migration file
  const content = MIGRATION_TEMPLATE.replace('{{name}}', `'${name}'`);
  await writeFile(filepath, content);
  
  console.log(`✅ Created migration: ${filepath}`);
  return filepath;
}

// Get migration name from command line arguments
const name = process.argv[2];
if (!name) {
  console.error('Please provide a migration name');
  console.log('Usage: npx tsx scripts/create-migration.ts "Add users table"');
  process.exit(1);
}

createMigration(name).catch(console.error);
