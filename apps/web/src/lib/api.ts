import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? `Erreur ${response.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

export type Page<T> = { results: T[]; total: number; limit: number; offset: number };

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function useApi<T>(path: string | null, options: { keepPrevious?: boolean } = {}) {
  return useQuery<T, ApiError>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: path !== null,
    placeholderData: options.keepPrevious ? (previous) => previous : undefined,
  });
}

/** Toute écriture rafraîchit l'ensemble des vues : les données sont petites et très liées entre elles. */
export function useSave() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, { method: "post" | "patch" | "del"; path: string; body?: unknown }>({
    mutationFn: ({ method, path, body }) => (method === "del" ? api.del(path) : api[method](path, body)),
    onSettled: () => client.invalidateQueries(),
  });
}
