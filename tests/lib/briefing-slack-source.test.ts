/**
 * Pure-helper tests for the Slack signal source. Composio is intentionally
 * not mocked — `gather()` short-circuits to [] when no connection is
 * configured, which is the test environment. The two functions worth
 * locking are the mention extractor and the teammate match, since a bug
 * in either silently misroutes signals.
 */

import { describe, expect, it } from 'vitest';
import {
  extractMentions,
  mentionsRealtor,
  isTeammate,
} from '@/lib/briefing/signal-sources/slack';

describe('slack signal source — extractMentions', () => {
  it('pulls a single Slack-rendered mention token', () => {
    expect(extractMentions('hey <@U0ME123>, wire instructions?')).toEqual(['U0ME123']);
  });

  it('returns multiple mentions in order', () => {
    expect(extractMentions('<@U01> and <@U02> please')).toEqual(['U01', 'U02']);
  });

  it('ignores bare @-names — Slack-rendered mentions use angle brackets', () => {
    // The bare-`@name` path is what slack.com types in the composer;
    // by the time the API hands us the message text, real mentions are
    // already rewritten to `<@USERID>`. A bare @ is just rendered text
    // and means nothing for routing.
    expect(extractMentions('hi @priya, see this')).toEqual([]);
  });

  it('returns empty for null, undefined, and empty text', () => {
    expect(extractMentions(null)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });

  it('handles mentions back-to-back without whitespace', () => {
    expect(extractMentions('<@U01><@U02>')).toEqual(['U01', 'U02']);
  });
});

describe('slack signal source — mentionsRealtor', () => {
  it('returns true when the realtor id appears in the text', () => {
    expect(mentionsRealtor('hey <@U0ME>, this one', 'U0ME')).toBe(true);
  });

  it('returns false when a different teammate is mentioned', () => {
    expect(mentionsRealtor('<@U0JESS> can you check this?', 'U0ME')).toBe(false);
  });

  it('returns false when the realtor id is null (unknown self)', () => {
    // AUTH_TEST failed or hasn't returned yet — we still see mentions
    // but can't trust any of them. Safer to drop than to surface a
    // signal for the wrong person.
    expect(mentionsRealtor('<@U0ME> ping', null)).toBe(false);
  });

  it('returns false on null/empty text', () => {
    expect(mentionsRealtor(null, 'U0ME')).toBe(false);
    expect(mentionsRealtor('', 'U0ME')).toBe(false);
  });

  it('returns true even when the realtor is one of several mentioned', () => {
    expect(mentionsRealtor('<@U0JESS> <@U0ME> <@U0PRIYA>', 'U0ME')).toBe(true);
  });
});

describe('slack signal source — isTeammate', () => {
  const team = new Set(['U0JESS', 'U0PRIYA', 'U0ME']);

  it('returns true when the sender is in the workspace user list', () => {
    expect(isTeammate('U0PRIYA', team)).toBe(true);
  });

  it('returns false for a Slack Connect / outside-org sender', () => {
    // The cross-walk rule: only DMs from people in the realtor's
    // workspace count as teammates. Slack Connect strangers drop.
    expect(isTeammate('U0STRANGER', team)).toBe(false);
  });

  it('returns false when the sender id is missing', () => {
    expect(isTeammate(undefined, team)).toBe(false);
    expect(isTeammate(null, team)).toBe(false);
    expect(isTeammate('', team)).toBe(false);
  });

  it('returns false against an empty team set', () => {
    // users.list returned nothing — no one is a teammate. Don't
    // accidentally surface every DM in that degenerate state.
    expect(isTeammate('U0PRIYA', new Set())).toBe(false);
  });
});
