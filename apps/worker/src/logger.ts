// Structured JSON logging for the worker.
//
// Every log line is a single JSON object with a stable `event` name plus
// contextual identifiers (job, queue, feed, article, user, run, digest) and an
// outcome, so feed pulls, article processing, regeneration, and digest builds
// are traceable in aggregated container logs. Output is suppressed under
// `NODE_ENV=test` to keep the unit-test runner readable; the processors are
// exercised directly there and their behavior is asserted through dependency
// doubles, not log output.

export type LogLevel = 'info' | 'error';

export type LogFields = Record<string, unknown>;

export function structuredLog(
  event: string,
  fields: LogFields = {},
  level: LogLevel = 'info',
): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const line = JSON.stringify({
    event,
    level,
    ts: new Date().toISOString(),
    ...fields,
  });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}
