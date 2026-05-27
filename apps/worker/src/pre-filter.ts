export interface PreFilterInput {
  title: string;
  content: string;
}

export interface PreFilterOptions {
  minContentChars: number;
}

export interface PreFilterResult {
  accepted: boolean;
  reason?: 'empty_content' | 'too_short' | 'seo_boilerplate';
  text: string;
}

const seoNoisePatterns = [
  /subscribe to our newsletter/i,
  /enable javascript/i,
  /cookie policy/i,
  /advertisement/i,
];

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function preFilterArticle(
  input: PreFilterInput,
  options: PreFilterOptions,
): PreFilterResult {
  const text = stripHtml(input.content);

  if (!text) {
    return {
      accepted: false,
      reason: 'empty_content',
      text,
    };
  }

  if (text.length < options.minContentChars) {
    return {
      accepted: false,
      reason: 'too_short',
      text,
    };
  }

  const matchedSeoPatterns = seoNoisePatterns.filter((pattern) =>
    pattern.test(text),
  );
  if (matchedSeoPatterns.length >= 2) {
    return {
      accepted: false,
      reason: 'seo_boilerplate',
      text,
    };
  }

  return {
    accepted: true,
    text,
  };
}
