import { Database } from 'sqlite';

export interface AnalysisCache {
  hashKey: number;
  bestMove: string;
  depth: number;
  engineVersion: string;
  createdAtMs?: number;
}

export class AnalysisCacheRepository {
  constructor(private db: Database) {}

  async get(hashKey: number): Promise<AnalysisCache | null> {
    try {
      const row = await this.db.get<{
        hash_key: number;
        best_move: string;
        depth: number;
        engine_version: string;
        created_at_ms: number;
      }>(
        `SELECT hash_key, best_move, depth, engine_version, created_at_ms
         FROM analysis_cache
         WHERE hash_key = ?`,
        [hashKey]
      );

      if (!row) {
        return null;
      }

      return {
        hashKey: row.hash_key,
        bestMove: row.best_move,
        depth: row.depth,
        engineVersion: row.engine_version,
        createdAtMs: row.created_at_ms,
      };
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error getting cache entry:', error);
      throw error;
    }
  }

  async set(cache: Omit<AnalysisCache, 'createdAtMs'>): Promise<void> {
    try {
      const now = Date.now();
      await this.db.run(
        `INSERT OR REPLACE INTO analysis_cache 
         (hash_key, best_move, depth, engine_version, created_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
        [cache.hashKey, cache.bestMove, cache.depth, cache.engineVersion, now]
      );
      console.log(`[AnalysisCache] ✅ Cached analysis for hash ${cache.hashKey}`);
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error setting cache entry:', error);
      throw error;
    }
  }

  async delete(hashKey: number): Promise<boolean> {
    try {
      const result = await this.db.run(
        `DELETE FROM analysis_cache WHERE hash_key = ?`,
        [hashKey]
      );
      const deleted = (result.changes || 0) > 0;
      if (deleted) {
        console.log(`[AnalysisCache] ✅ Deleted cache entry for hash ${hashKey}`);
      }
      return deleted;
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error deleting cache entry:', error);
      throw error;
    }
  }

  async clearAll(): Promise<number> {
    try {
      const result = await this.db.run(`DELETE FROM analysis_cache`);
      const count = result.changes || 0;
      console.log(`[AnalysisCache] ✅ Cleared all cache entries (${count} deleted)`);
      return count;
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error clearing all cache entries:', error);
      throw error;
    }
  }

  async clearByVersion(engineVersion: string): Promise<number> {
    try {
      const result = await this.db.run(
        `DELETE FROM analysis_cache WHERE engine_version = ?`,
        [engineVersion]
      );
      const count = result.changes || 0;
      console.log(`[AnalysisCache] ✅ Cleared cache entries for engine version ${engineVersion} (${count} deleted)`);
      return count;
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error clearing cache by version:', error);
      throw error;
    }
  }

  async getStats(): Promise<{ totalEntries: number; byVersion: Record<string, number> }> {
    try {
      const totalRow = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM analysis_cache`
      );
      const totalEntries = totalRow?.count || 0;

      const versionRows = await this.db.all<{ engine_version: string; count: number }>(
        `SELECT engine_version, COUNT(*) as count
         FROM analysis_cache
         GROUP BY engine_version`
      );

      const byVersion: Record<string, number> = {};
      for (const row of versionRows) {
        byVersion[row.engine_version] = row.count;
      }

      return { totalEntries, byVersion };
    } catch (error) {
      console.error('[AnalysisCache] ❌ Error getting cache stats:', error);
      throw error;
    }
  }
}
