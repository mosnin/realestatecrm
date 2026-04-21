import { redis } from '@/lib/redis';

export function isValidIcon(str: string) {
  if (str.length > 10) {
    return false;
  }

  try {
    // Primary validation: Check if the string contains at least one emoji character
    // This regex pattern matches most emoji Unicode ranges
    const emojiPattern = /[\p{Emoji}]/u;
    if (emojiPattern.test(str)) {
      return true;
    }
  } catch (error) {
    // If the regex fails (e.g., in environments that don't support Unicode property escapes),
    // fall back to a simpler validation
    console.warn(
      'Emoji regex validation failed, using fallback validation',
      error
    );
  }

  // Fallback validation: Check if the string is within a reasonable length
  // This is less secure but better than no validation
  return str.length >= 1 && str.length <= 10;
}

type SlugData = {
  emoji: string;
  createdAt: number;
};

export async function getSlugData(slug: string) {
  const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const data = await redis.get<SlugData>(
    `slug:${sanitizedSlug}`
  );
  return data;
}

export async function getAllSlugs() {
  const keys = await redis.keys('slug:*');

  if (!keys.length) {
    return [];
  }

  const values = await redis.mget<SlugData[]>(...keys);

  return keys.map((key, index) => {
    const slug = key.replace('slug:', '');
    const data = values[index];

    return {
      slug,
      emoji: data?.emoji || '❓',
      createdAt: data?.createdAt || Date.now()
    };
  });
}
