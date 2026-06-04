import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildEntitySeenRanges,
  feedLinksForArticle,
} from './seed-helpers.js';

test('feedLinksForArticle includes primary and extra feed links once', () => {
  const links = feedLinksForArticle({
    duplicateFeedKeys: ['wiregraph', 'techpulse'],
    feedKey: 'techpulse',
    url: 'https://example.test/story',
  });

  assert.deepEqual(links, [
    { feedKey: 'techpulse', originalUrl: 'https://example.test/story' },
    { feedKey: 'wiregraph', originalUrl: 'https://example.test/story' },
  ]);
});

test('buildEntitySeenRanges derives first and last seen from mentioning articles', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');
  const secondsAgo = (daysAgo: number) =>
    Math.floor((now.getTime() - daysAgo * 24 * 60 * 60 * 1000) / 1000);
  const ranges = buildEntitySeenRanges(
    [
      { daysAgo: 5, mentions: ['openai', 'microsoft'] },
      { daysAgo: 1, mentions: ['openai'] },
      { daysAgo: 3, mentions: ['microsoft'] },
      { daysAgo: 0, mentions: [] },
    ],
    now,
  );

  assert.deepEqual(ranges.get('openai'), {
    firstSeen: secondsAgo(5),
    lastSeen: secondsAgo(1),
  });
  assert.deepEqual(ranges.get('microsoft'), {
    firstSeen: secondsAgo(5),
    lastSeen: secondsAgo(3),
  });
  assert.equal(ranges.has('unused'), false);
});
