import Parser from 'rss-parser';

export interface ParsedFeedItem {
  title: string;
  url: string;
  content: string;
  author?: string;
  publishedAt?: Date;
  externalId?: string;
}

export interface ParsedFeed {
  title?: string;
  items: ParsedFeedItem[];
}

const parser = new Parser();

export async function parseFeedUrl(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);
  const items: ParsedFeedItem[] = [];

  for (const item of feed.items) {
    const itemUrl = item.link ?? item.guid;
    if (!item.title || !itemUrl) {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const contentEncoded = itemRecord['content:encoded'];
    const content =
      (typeof contentEncoded === 'string' ? contentEncoded : undefined) ??
      item.content ??
      item.contentSnippet ??
      item.summary ??
      '';

    items.push({
      title: item.title,
      url: itemUrl,
      content,
      author:
        typeof item.creator === 'string'
          ? item.creator
          : typeof item.author === 'string'
            ? item.author
            : undefined,
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      externalId: item.guid,
    });
  }

  return {
    title: feed.title,
    items,
  };
}
