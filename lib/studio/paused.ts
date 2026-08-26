import { NextResponse } from 'next/server';
import { isStudioEnabled } from '@/lib/chippi/studio-flag';

export function studioPausedResponse(): NextResponse {
  return NextResponse.json({ error: 'Studio is paused.' }, { status: 404 });
}

export function rejectIfStudioPaused(): NextResponse | null {
  return isStudioEnabled() ? null : studioPausedResponse();
}
