import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class APIRequestError extends Error {
  constructor(
    message: string, 
    public status?: number,
    public kind: 'api' | 'network' = 'api'
  ) {
    super(message);
    this.name = 'APIRequestError';
  }
}

export async function handleApiResponse<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = res.statusText || 'Request failed';
    
    try {
      const json = await res.json();
      if (json.message) {
        errorMessage = json.message;
      } else if (json.error) {
        errorMessage = json.error;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) {
          errorMessage = text;
        }
      } catch {
        // Use default statusText
      }
    }
    
    throw new APIRequestError(errorMessage, res.status, 'api');
  }
  
  return res.json();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new APIRequestError(`${res.status}: ${text}`, res.status);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
