const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Access token lives in memory only (not localStorage)
// Lost on a hard refresh by design; callers rehydrate it via refresh() on app load.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      // FormData bodies need the browser to set their own Content-Type
      // (including the multipart boundary) — forcing JSON here breaks upload parsing.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// GET /receipts/{id}/image requires an Authorization header, so it can't be used
// directly as an <img src> — fetch the blob and hand back an object URL instead.
// Callers must URL.revokeObjectURL() it when done (e.g. on unmount).
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${response.status} ${response.statusText}`,
    );
  }

  return response.blob();
}

export function getHealth() {
  return apiFetch<{ status: string }>("/health");
}

export type AuthResponse = {
  access_token: string;
  token_type: string;
};

export function login(email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refresh() {
  return apiFetch<AuthResponse>("/auth/refresh", { method: "POST" });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export type Me = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export function getMe() {
  return apiFetch<Me>("/auth/me");
}

export type ReceiptPublic = {
  id: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  merchant: string;
  amount: string;
  currency: string;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  image_url: string;
};

export type ReceiptCreateInput = {
  file: File;
  merchant: string;
  amount: string;
  purchased_at: string;
  currency: string;
  notes?: string;
};

export type ReceiptUpdateInput = Partial<{
  merchant: string;
  amount: string;
  currency: string;
  purchased_at: string;
  notes: string | null;
}>;

export function listReceipts() {
  return apiFetch<ReceiptPublic[]>("/receipts");
}

export function getReceipt(id: string) {
  return apiFetch<ReceiptPublic>(`/receipts/${id}`);
}

export function createReceipt(input: ReceiptCreateInput) {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("merchant", input.merchant);
  formData.set("amount", input.amount);
  formData.set("purchased_at", input.purchased_at);
  formData.set("currency", input.currency);
  if (input.notes) formData.set("notes", input.notes);

  return apiFetch<ReceiptPublic>("/receipts", {
    method: "POST",
    body: formData,
  });
}

export function updateReceipt(id: string, patch: ReceiptUpdateInput) {
  return apiFetch<ReceiptPublic>(`/receipts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteReceipt(id: string) {
  return apiFetch<void>(`/receipts/${id}`, { method: "DELETE" });
}

export async function getReceiptImageObjectUrl(id: string): Promise<string> {
  const blob = await apiFetchBlob(`/receipts/${id}/image`);
  return URL.createObjectURL(blob);
}
