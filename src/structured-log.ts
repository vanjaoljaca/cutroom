type LogFields = Record<string, boolean | number | string | undefined>;

export function logEvent(event: string, fields: LogFields = {}): void {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

export function logError(event: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ at: new Date().toISOString(), event, message }));
}
