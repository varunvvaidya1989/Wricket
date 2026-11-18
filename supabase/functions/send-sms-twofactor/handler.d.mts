export function createSmsHook(options: {
  verify: ((raw: string, headers: Record<string, string>) => unknown | Promise<unknown>) | null;
  apiKey?: string;
  template?: string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}): (request: Request) => Promise<Response>;
