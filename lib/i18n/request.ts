import { headers } from 'next/headers';
import { DEFAULT_LANG, isLang, type Lang } from './markets';

/** Language settled by middleware for this request. */
export async function getRequestLang(): Promise<Lang> {
  const value = (await headers()).get('x-language');
  return isLang(value) ? value : DEFAULT_LANG;
}
