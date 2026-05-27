import { BadRequestException, Injectable } from '@nestjs/common';
import Parser from 'rss-parser';

export interface FeedValidationResult {
  title?: string;
}

@Injectable()
export class FeedValidationService {
  private readonly parser = new Parser();

  async validateFeedUrl(url: string): Promise<FeedValidationResult> {
    this.assertHttpUrl(url);

    try {
      const feed = await this.parser.parseURL(url);
      if (!feed.title && (!feed.items || feed.items.length === 0)) {
        throw new BadRequestException(
          'URL did not return an RSS or Atom feed.',
        );
      }

      return {
        title: feed.title,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Feed URL is unreachable or invalid.');
    }
  }

  private assertHttpUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Unsupported protocol.');
      }
    } catch {
      throw new BadRequestException('Feed URL must be a valid HTTP(S) URL.');
    }
  }
}
