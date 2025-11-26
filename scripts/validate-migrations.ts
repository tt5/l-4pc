import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { PATHS } from './config.js';

interface Migration {
  name: string;
  up: Function;
  down?: Function;
}

const REQUIRED_EXPORTS = ['name', 'up'];

export async function validateMigrations() {
  console.log('🔍 Validating migrations...');
  
  try {
    const files = (await readdir(PATHS.MIGRATIONS_DIR))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    
    if (files.length === 0) {
      console.log('⚠️  No migration files found');
      return true;
    }

    let hasErrors = false;
    
    for (const file of files) {
      const filePath = join(PATHS.MIGRATIONS_DIR, file);
      
      // Basic filename validation
      if (!/^\d{4,}_[a-z0-9_]+\.[jt]s$/i.test(file)) {
        console.error(`❌ Invalid migration filename: ${file}. Must be in format: YYYYMMDD_HHMMSS_description.ts`);
        hasErrors = true;
        continue;
      }
      
      // Check required exports
      try {
        // @vite-ignore
        const migration = await import(`../migrations/${file}`) as Migration;
        
        for (const exp of REQUIRED_EXPORTS) {
          if (!(exp in migration)) {
            console.error(`❌ Missing required export '${exp}' in ${file}`);
            hasErrors = true;
          }
        }
        
        // Check if migration name matches filename
        const expectedName = file.replace(/\.[jt]s$/, '');
        if (migration.name !== expectedName) {
          console.error(`❌ Migration name '${migration.name}' in ${file} doesn't match filename '${expectedName}'`);
          hasErrors = true;
        }
        
        console.log(`✅ ${file} is valid`);
        
      } catch (error) {
        console.error(`❌ Failed to load migration ${file}:`, error);
        hasErrors = true;
      }
    }
    
    if (!hasErrors) {
      console.log('✨ All migrations are valid!');
    }
    
    return !hasErrors;
    
  } catch (error) {
    console.error('Error validating migrations:', error);
    return false;
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigrations().then(valid => {
    process.exit(valid ? 0 : 1);
  });
}
