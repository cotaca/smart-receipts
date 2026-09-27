import type { Language } from "@/lib/locale";

export type { Language };

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

// The access token expires after 15 minutes, but the page may stay open much
// longer. On a 401 we refresh once via the httpOnly cookie and retry the
// request once. Concurrent 401s share one in-flight refresh. /auth/* is
// exempt: a 401 there means bad credentials or a dead refresh cookie, and
// retrying would loop.
let refreshing: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) return false;
      const { access_token } = (await response.json()) as AuthResponse;
      accessToken = access_token;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  // Headers are rebuilt per attempt so the retry carries the new token.
  const send = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...headers, ...authHeaders(), ...init.headers },
    });

  const response = await send();
  if (
    response.status === 401 &&
    !path.startsWith("/auth/") &&
    (await refreshAccessToken())
  ) {
    return send();
  }
  return response;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  const response = await authedFetch(
    path,
    init,
    // FormData bodies need the browser to set their own Content-Type
    // (including the multipart boundary) — forcing JSON here breaks upload parsing.
    isFormData ? {} : { "Content-Type": "application/json" },
  );

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
  const response = await authedFetch(path);

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

export type NumberFormat = "de-DE" | "en-US";
export type Currency = "EUR" | "USD" | "GBP" | "CHF";

export type Me = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  number_format: NumberFormat;
  default_currency: Currency;
  language: Language;
};

export function getMe() {
  return apiFetch<Me>("/auth/me");
}

export function updateMe(
  patch: Partial<Pick<Me, "number_format" | "default_currency" | "language">>,
) {
  return apiFetch<Me>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function deleteAccount(password: string) {
  return apiFetch<void>("/auth/me", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export type ReceiptItem = {
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
};

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
  items: ReceiptItem[];
};

export type ReceiptCreateInput = {
  file: File;
  merchant: string;
  amount: string;
  purchased_at: string;
  currency: string;
  notes?: string;
  items?: ReceiptItem[];
};

export type ReceiptUpdateInput = Partial<{
  merchant: string;
  amount: string;
  currency: string;
  purchased_at: string;
  notes: string | null;
  items: ReceiptItem[];
}>;

export function listReceipts() {
  return apiFetch<ReceiptPublic[]>("/receipts");
}

export function getReceipt(id: string) {
  return apiFetch<ReceiptPublic>(`/receipts/${id}`);
}

export type ReceiptExtraction = {
  merchant: string | null;
  amount: string | null;
  purchased_at: string | null;
  items: ReceiptItem[];
  low_quality: boolean;
};

export function extractReceipt(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  return apiFetch<ReceiptExtraction>("/receipts/extract", {
    method: "POST",
    body: formData,
  });
}

export function createReceipt(input: ReceiptCreateInput) {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("merchant", input.merchant);
  formData.set("amount", input.amount);
  formData.set("purchased_at", input.purchased_at);
  formData.set("currency", input.currency);
  if (input.notes) formData.set("notes", input.notes);
  formData.set("items", JSON.stringify(input.items ?? []));

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

export function replaceReceiptImage(id: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);

  return apiFetch<ReceiptPublic>(`/receipts/${id}/image`, {
    method: "PUT",
    body: formData,
  });
}
