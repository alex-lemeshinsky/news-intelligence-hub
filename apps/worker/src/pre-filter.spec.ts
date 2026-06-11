import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preFilterArticle, stripHtml } from './pre-filter.js';

describe('stripHtml', () => {
  it('removes script and style blocks with their contents', () => {
    const html =
      '<p>Visible</p><script>track();</script><style>.a{color:red}</style>';

    assert.equal(stripHtml(html), 'Visible');
  });

  it('strips tags, decodes non-breaking spaces, and collapses whitespace', () => {
    const html = '<div>  Hello&nbsp;&nbsp;<b>world</b>\n\n  again  </div>';

    assert.equal(stripHtml(html), 'Hello world again');
  });

  it('returns an empty string for markup with no text content', () => {
    assert.equal(stripHtml('<div><span></span></div>'), '');
  });
});

describe('preFilterArticle', () => {
  const options = { minContentChars: 20 };

  it('accepts content above the minimum length and exposes stripped text', () => {
    const result = preFilterArticle(
      {
        content:
          '<p>This article has clearly enough substantive body text.</p>',
        title: 'Real article',
      },
      options,
    );

    assert.equal(result.accepted, true);
    assert.equal(result.reason, undefined);
    assert.equal(
      result.text,
      'This article has clearly enough substantive body text.',
    );
  });

  it('rejects content that strips down to nothing as empty_content', () => {
    const result = preFilterArticle(
      { content: '<div><script>noop();</script></div>', title: 'Empty' },
      options,
    );

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'empty_content');
    assert.equal(result.text, '');
  });

  it('rejects content shorter than the configured minimum as too_short', () => {
    const result = preFilterArticle(
      { content: '<p>Too short.</p>', title: 'Brief' },
      options,
    );

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'too_short');
  });

  it('honors the configured minimum length boundary', () => {
    const text = 'x'.repeat(20);

    assert.equal(
      preFilterArticle({ content: text, title: 'Exact' }, options).accepted,
      true,
    );
    assert.equal(
      preFilterArticle({ content: 'x'.repeat(19), title: 'Below' }, options)
        .reason,
      'too_short',
    );
  });

  it('rejects content matching two or more boilerplate patterns as seo_boilerplate', () => {
    const result = preFilterArticle(
      {
        content:
          'Please enable JavaScript to continue. Subscribe to our newsletter ' +
          'for more long-form coverage and additional reading material here.',
        title: 'Junk',
      },
      options,
    );

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'seo_boilerplate');
  });

  it('keeps content that trips only a single boilerplate pattern', () => {
    const result = preFilterArticle(
      {
        content:
          'A genuine report on the topic that happens to mention an ' +
          'advertisement once while otherwise carrying real reporting.',
        title: 'Mostly real',
      },
      options,
    );

    assert.equal(result.accepted, true);
    assert.equal(result.reason, undefined);
  });
});
