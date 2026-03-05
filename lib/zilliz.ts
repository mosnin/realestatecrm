import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

const globalForMilvus = globalThis as unknown as {
  milvus: MilvusClient | undefined;
};

function getMilvusClient() {
  if (!process.env.ZILLIZ_URI || !process.env.ZILLIZ_TOKEN) {
    throw new Error('ZILLIZ_URI and ZILLIZ_TOKEN must be set');
  }

  if (!globalForMilvus.milvus) {
    globalForMilvus.milvus = new MilvusClient({
      address: process.env.ZILLIZ_URI,
      token: process.env.ZILLIZ_TOKEN
    });
  }

  return globalForMilvus.milvus;
}

export function collectionName(spaceId: string) {
  return `space_${spaceId.replace(/-/g, '_')}`;
}

const VECTOR_DIM = 1536; // text-embedding-3-small dimension

export async function ensureCollection(spaceId: string) {
  const client = getMilvusClient();
  const name = collectionName(spaceId);

  const exists = await client.hasCollection({ collection_name: name });
  if (exists.value) return;

  await client.createCollection({
    collection_name: name,
    fields: [
      {
        name: 'id',
        data_type: DataType.VarChar,
        max_length: 64,
        is_primary_key: true,
        autoID: false
      },
      {
        name: 'entity_type',
        data_type: DataType.VarChar,
        max_length: 16
      },
      {
        name: 'entity_id',
        data_type: DataType.VarChar,
        max_length: 64
      },
      {
        name: 'text',
        data_type: DataType.VarChar,
        max_length: 4096
      },
      {
        name: 'vector',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM
      }
    ]
  });

  await client.createIndex({
    collection_name: name,
    field_name: 'vector',
    index_type: 'AUTOINDEX',
    metric_type: 'COSINE'
  });

  await client.loadCollection({ collection_name: name });
}

export async function upsertVector(
  spaceId: string,
  id: string,
  entityType: 'contact' | 'deal',
  entityId: string,
  text: string,
  vector: number[]
) {
  const client = getMilvusClient();
  await ensureCollection(spaceId);
  const name = collectionName(spaceId);

  await client.upsert({
    collection_name: name,
    data: [{ id, entity_type: entityType, entity_id: entityId, text, vector }]
  });
}

export async function deleteVector(spaceId: string, id: string) {
  const client = getMilvusClient();
  const name = collectionName(spaceId);
  const exists = await client.hasCollection({ collection_name: name });
  if (!exists.value) return;

  await client.delete({
    collection_name: name,
    filter: `id == "${id}"`
  });
}

export async function searchVectors(
  spaceId: string,
  queryVector: number[],
  topK = 5
) {
  const client = getMilvusClient();
  await ensureCollection(spaceId);
  const name = collectionName(spaceId);

  const results = await client.search({
    collection_name: name,
    data: [queryVector],
    limit: topK,
    output_fields: ['entity_type', 'entity_id', 'text']
  });

  return results.results ?? [];
}
