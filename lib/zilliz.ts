/**
 * Vector store operations — backed by Supabase pgvector.
 *
 * Replaces the previous Zilliz/Milvus implementation.
 * The Document table stores embeddings per entity per space,
 * and similarity search uses cosine distance via pgvector.
 */
import { supabase } from '@/lib/supabase';

export async function upsertVector(
  spaceId: string,
  id: string,
  entityType: 'contact' | 'deal',
  entityId: string,
  text: string,
  vector: number[]
) {
  // Supabase pgvector expects the embedding as a string like '[0.1, 0.2, ...]'
  const embeddingStr = `[${vector.join(',')}]`;

  const { error } = await supabase.from('Document').upsert(
    {
      id,
      spaceId,
      entityType,
      entityId,
      content: text.slice(0, 4000),
      embedding: embeddingStr,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[vector] upsert failed', { id, entityType, entityId, error });
    throw error;
  }
}

export async function deleteVector(spaceId: string, id: string) {
  const { error } = await supabase
    .from('Document')
    .delete()
    .eq('id', id)
    .eq('spaceId', spaceId);

  if (error) {
    console.error('[vector] delete failed', { id, spaceId, error });
  }
}

export type VectorSearchResult = {
  entity_type: string;
  entity_id: string;
  content: string;
  similarity: number;
};

/**
 * Semantic search using pgvector cosine similarity.
 *
 * This calls a Supabase RPC function `match_documents` which must exist in the DB.
 * If RPC is not available, falls back to fetching all documents for the space
 * and computing similarity client-side (works for small datasets).
 */
export async function searchVectors(
  spaceId: string,
  queryVector: number[],
  topK = 5
): Promise<VectorSearchResult[]> {
  const embeddingStr = `[${queryVector.join(',')}]`;

  // Try RPC first (fastest — similarity computed in Postgres)
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embeddingStr,
      match_space_id: spaceId,
      match_count: topK,
    });

    if (!error && data) {
      return (data as { entity_type: string; entity_id: string; content: string; similarity: number }[]).map((row) => ({
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        content: row.content,
        similarity: row.similarity,
      }));
    }

    // If RPC doesn't exist yet, fall through to client-side fallback
    if (error) {
      console.warn('[vector] RPC match_documents not available, using client-side fallback', { error: error.message });
    }
  } catch (err) {
    console.warn('[vector] RPC call failed, using client-side fallback', { err });
  }

  // Fallback: fetch all documents for the space and compute similarity in JS
  // This works fine for small datasets (<1000 documents per space)
  const { data: docs, error: fetchError } = await supabase
    .from('Document')
    .select('id, "entityType", "entityId", content, embedding')
    .eq('spaceId', spaceId);

  if (fetchError) {
    console.error('[vector] fallback fetch failed', { spaceId, error: fetchError });
    return [];
  }

  if (!docs?.length) return [];

  // Compute cosine similarity client-side
  const results = docs
    .map((doc: { id: string; entityType: string; entityId: string; content: string; embedding: string }) => {
      const docVector = parseEmbedding(doc.embedding);
      if (!docVector) return null;
      const sim = cosineSimilarity(queryVector, docVector);
      return {
        entity_type: doc.entityType,
        entity_id: doc.entityId,
        content: doc.content,
        similarity: sim,
      };
    })
    .filter((r): r is VectorSearchResult => r !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw;
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// Legacy export kept for backwards compatibility with existing imports
export function collectionName(_spaceId: string) {
  return 'Document';
}

export async function ensureCollection(_spaceId: string) {
  // No-op — table is created via schema.sql migration
}
