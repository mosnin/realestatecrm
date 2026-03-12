import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    slug,
    name,
    emoji,
    notifications,
    phoneNumber,
    myConnections,
    aiPersonalization,
    billingSettings,
    anthropicApiKey
  } = await req.json();

  const spaceRows = await sql`
    SELECT "id", "slug", "name", "emoji", "createdAt", "ownerId"
    FROM "Space"
    WHERE "slug" = ${slug}
  `;
  if (!spaceRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updatedRows = await sql`
    UPDATE "Space"
    SET
      "name" = ${name}
      ${emoji !== undefined ? sql`, "emoji" = ${emoji}` : sql``}
    WHERE "slug" = ${slug}
    RETURNING "id", "slug", "name", "emoji", "createdAt", "ownerId"
  `;

  await sql`
    INSERT INTO "SpaceSetting" ("id", "spaceId", "notifications", "phoneNumber", "myConnections", "aiPersonalization", "billingSettings", "anthropicApiKey")
    VALUES (${crypto.randomUUID()}, ${space.id}, ${notifications}, ${phoneNumber}, ${myConnections}, ${aiPersonalization}, ${billingSettings}, ${anthropicApiKey || null})
    ON CONFLICT ("spaceId") DO UPDATE SET
      "notifications" = ${notifications},
      "phoneNumber" = ${phoneNumber},
      "myConnections" = ${myConnections},
      "aiPersonalization" = ${aiPersonalization},
      "billingSettings" = ${billingSettings},
      "anthropicApiKey" = ${anthropicApiKey || null}
  `;

  // Update Redis emoji
  const existing = await redis.get<any>(`slug:${slug}`).catch(() => null);
  if (existing) {
    await redis
      .set(`slug:${slug}`, { ...existing, emoji })
      .catch(() => null);
  }

  return NextResponse.json(updatedRows[0]);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();

  const spaceRows = await sql`
    SELECT "id", "slug", "name", "emoji", "createdAt", "ownerId"
    FROM "Space"
    WHERE "slug" = ${slug}
  `;
  if (!spaceRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await redis.del(`slug:${slug}`).catch(() => null);
  await sql`DELETE FROM "Space" WHERE "slug" = ${slug}`;

  return NextResponse.json({ success: true });
}
