const DAY_MS = 24 * 60 * 60 * 1000;

export interface ArticleFeedLinkInput {
  duplicateFeedKeys?: readonly string[];
  feedKey: string;
  url: string;
}

export interface ArticleFeedLink {
  feedKey: string;
  originalUrl: string;
}

export interface EntitySeenArticle {
  daysAgo: number;
  mentions: readonly string[];
}

export interface EntitySeenRange {
  firstSeen: number;
  lastSeen: number;
}

export function feedLinksForArticle(
  article: ArticleFeedLinkInput,
): ArticleFeedLink[] {
  const seenFeedKeys = new Set<string>();
  const feedKeys = [article.feedKey, ...(article.duplicateFeedKeys ?? [])];
  const links: ArticleFeedLink[] = [];

  for (const feedKey of feedKeys) {
    if (seenFeedKeys.has(feedKey)) {
      continue;
    }
    seenFeedKeys.add(feedKey);
    links.push({ feedKey, originalUrl: article.url });
  }

  return links;
}

export function buildEntitySeenRanges(
  articles: readonly EntitySeenArticle[],
  now: Date,
): Map<string, EntitySeenRange> {
  const ranges = new Map<string, EntitySeenRange>();

  for (const article of articles) {
    const timestamp = unixSeconds(publishedAtForDaysAgo(article.daysAgo, now));
    for (const entityKey of article.mentions) {
      const current = ranges.get(entityKey);
      ranges.set(entityKey, {
        firstSeen: current ? Math.min(current.firstSeen, timestamp) : timestamp,
        lastSeen: current ? Math.max(current.lastSeen, timestamp) : timestamp,
      });
    }
  }

  return ranges;
}

export function publishedAtForDaysAgo(daysAgo: number, now: Date): Date {
  return new Date(now.getTime() - daysAgo * DAY_MS);
}

export function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
