'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ImageGeneration } from '@/components/ai/agent-status';

interface GeneratedAssetData {
  fileId?: unknown;
  file_id?: unknown;
  kind?: unknown;
  prompt?: unknown;
}

export function GeneratedImageResult({
  data,
  prompt,
  status,
  error,
}: {
  data?: GeneratedAssetData;
  prompt?: string;
  status: 'running' | 'complete' | 'error';
  error?: string;
}) {
  const fileId = typeof data?.fileId === 'string'
    ? data.fileId
    : typeof data?.file_id === 'string'
      ? data.file_id
      : null;
  const kind = data?.kind === 'video' ? 'video' : 'image';
  const resolvedPrompt = typeof data?.prompt === 'string' ? data.prompt : prompt;
  const [asset, setAsset] = useState<{ url: string; mimeType: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'complete' || !fileId) return;
    const controller = new AbortController();
    setAsset(null);
    setLoadError(null);
    void fetch(`/api/files/${encodeURIComponent(fileId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The generated file preview is unavailable.');
        return response.json() as Promise<{ url?: unknown; mimeType?: unknown }>;
      })
      .then((result) => {
        if (typeof result.url !== 'string') throw new Error('The generated file preview is unavailable.');
        setAsset({
          url: result.url,
          mimeType: typeof result.mimeType === 'string' ? result.mimeType : '',
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(reason instanceof Error ? reason.message : 'The generated file preview is unavailable.');
      });
    return () => controller.abort();
  }, [fileId, status]);

  const resolvedStatus = status === 'running'
    ? 'generating'
    : status === 'error' || loadError || (status === 'complete' && !fileId)
      ? 'error'
      : asset
        ? 'complete'
        : 'refining';

  return (
    <ImageGeneration
      status={resolvedStatus}
      statusText={
        loadError ??
        error ??
        (status === 'complete' && !fileId ? 'Generated file was not saved' : undefined)
      }
      prompt={resolvedPrompt}
      label={resolvedPrompt ? `Generated media: ${resolvedPrompt}` : 'Generated media'}
    >
      {asset && kind === 'video' ? (
        <video controls preload="metadata" src={asset.url} aria-label={resolvedPrompt ?? 'Generated video'} />
      ) : asset ? (
        <Image
          src={asset.url}
          alt={resolvedPrompt ?? 'Generated image'}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 576px"
        />
      ) : null}
    </ImageGeneration>
  );
}
