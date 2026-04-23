import type { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { AnalysisCacheRepository } from '~/lib/server/repositories/analysisCache.repository';

export async function POST({ request }: APIEvent) {
  try {
    const db = await getDb();
    const cacheRepo = new AnalysisCacheRepository(db);
    
    const url = new URL(request.url);
    const version = url.searchParams.get('version');
    
    let count: number;
    if (version) {
      count = await cacheRepo.clearByVersion(version);
    } else {
      count = await cacheRepo.clearAll();
    }
    
    return new Response(JSON.stringify({
      success: true,
      count,
      version: version || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Cache clear error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: errorMessage
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
