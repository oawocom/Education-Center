// ============================================================
// Education Center — paylaşılan API qatı
//
// Bütün komponentlər API-yə YALNIZ bu fayldan çıxmalıdır.
// Token, xəta emalı və icazə yoxlaması bir yerdədir.
// Mərkəz ünvandan (domendən) tanınır — server özü müəyyən edir.
//
// Giriş edilibsə (edu_token): /api/sf/... + Authorization: Bearer
// Giriş edilməyibsə: /api/... (giriş, qeydiyyat, konfiqurasiya)
// ============================================================

import { toast } from 'sonner';

export const API_BASE = '/api';

// ---------- Yerli yaddaş ----------

const K_TOKEN = 'edu_token';
const K_USER = 'edu_user';

export interface EduUser {
  id: number;
  email: string;
  name: string;
  display_name?: string;
  role: 'admin' | 'teacher' | 'student' | 'guardian' | '';
  code?: string;
  status?: 'active' | 'pending';
  sub_role_id?: number;
  avatar?: string;
  teacher_id?: number;
  student_id?: number;
  guardian_id?: number;
  branch_id?: number;
  permissions: Record<string, string[]>;
}

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch (e) {
    return '';
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}

export function getToken(): string {
  return safeGet(K_TOKEN);
}

export function getUser(): EduUser | null {
  const raw = safeGet(K_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EduUser;
  } catch (e) {
    return null;
  }
}

export function saveSession(token: string, user: EduUser): void {
  safeSet(K_TOKEN, token);
  safeSet(K_USER, JSON.stringify(user));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_USER);
  } catch (e) {
    /* ignore */
  }
}

// ---------- İcazə ----------

// can - istifadəçinin resurs üzərində əməliyyat icazəsi varmı.
// Menyu və düymələr bunun əsasında gizlədilir. Bu, təhlükəsizlik deyil —
// əsl yoxlama backend-dədir; bu yalnız istifadəçiyə lazımsız düymə
// göstərməmək üçündür.
export function can(resource: string, action: string = 'read'): boolean {
  const user = getUser();
  if (!user || !user.permissions) return false;
  const acts = user.permissions[resource];
  return Array.isArray(acts) && acts.indexOf(action) !== -1;
}

export function canAny(resources: string[], action: string = 'read'): boolean {
  for (const r of resources) {
    if (can(r, action)) return true;
  }
  return false;
}

// ---------- Sorğu qatı ----------

function apiRoot(): string {
  return getToken() ? API_BASE + '/sf' : API_BASE;
}

function headers(json: boolean = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function handle(res: Response): Promise<any> {
  if (res.status === 204) return null;

  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = text;
    }
  }

  if (res.ok) return body;

  const message = (body && (body.error || body.detail)) || 'Xəta baş verdi';

  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, message, body);
  }

  if (res.status === 403) {
    toast.error(message, {
      description: 'Bu əməliyyat üçün icazəniz yoxdur. Lazımdırsa admindən açmasını xahiş edin.',
    });
    throw new ApiError(403, message, body);
  }

  throw new ApiError(res.status, message, body);
}

export interface ListParams {
  page?: number;
  per_page?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  archived?: '1' | 'all';
  [key: string]: string | number | undefined;
}

export interface ListResult<T = any> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

function qs(params?: ListParams): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const key of Object.keys(params)) {
    const v = params[key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// ---------- Ümumi CRUD (backend-dəki generic CRUD-un qarşılığı) ----------

export const api = {
  list<T = any>(resource: string, params?: ListParams): Promise<ListResult<T>> {
    return fetch(apiRoot() + '/' + resource + qs(params), {
      headers: headers(false),
      credentials: 'include',
    }).then(handle);
  },

  get<T = any>(resource: string, id: number | string): Promise<T> {
    return fetch(apiRoot() + '/' + resource + '/' + id, {
      headers: headers(false),
      credentials: 'include',
    }).then(handle);
  },

  create<T = any>(resource: string, payload: any): Promise<T> {
    return fetch(apiRoot() + '/' + resource, {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify(payload),
    }).then(handle);
  },

  update<T = any>(resource: string, id: number | string, payload: any): Promise<T> {
    return fetch(apiRoot() + '/' + resource + '/' + id, {
      method: 'PUT',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify(payload),
    }).then(handle);
  },

  remove(resource: string, id: number | string): Promise<any> {
    return fetch(apiRoot() + '/' + resource + '/' + id, {
      method: 'DELETE',
      headers: headers(false),
      credentials: 'include',
    }).then(handle);
  },

  archive(resource: string, id: number | string, restore: boolean = false): Promise<any> {
    return fetch(apiRoot() + '/' + resource + '/' + id + (restore ? '/restore' : '/archive'), {
      method: 'PUT',
      headers: headers(false),
      credentials: 'include',
    }).then(handle);
  },

  // Sərbəst çağırış (CRUD-a uyğun gəlməyən endpoint-lər üçün)
  raw(path: string, init?: RequestInit): Promise<any> {
    const isJson = !init || !(init.body instanceof FormData);
    return fetch(apiRoot() + path, {
      ...init,
      headers: { ...headers(isJson), ...((init && init.headers) || {}) },
      credentials: 'include',
    }).then(handle);
  },
};

// ---------- Auth (token tələb etməyən endpoint-lər) ----------

export const auth = {
  login(email: string, password: string): Promise<{ token: string; user: EduUser }> {
    return fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handle);
  },

  me(): Promise<EduUser> {
    return api.raw('/auth/me');
  },

  changePassword(current: string, next: string): Promise<any> {
    return api.raw('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
  },

  logout(): void {
    clearSession();
  },

  // ---- Qeydiyyat / Google / rol / kod ----
  register(name: string, email: string, password: string): Promise<{ token: string; user: EduUser }> {
    return fetch(API_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    }).then(handle);
  },

  google(credential: string): Promise<{ token: string; user: EduUser }> {
    return fetch(API_BASE + '/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    }).then(handle);
  },

  config(): Promise<{ google_client_id: string; registration: boolean }> {
    return fetch(API_BASE + '/auth/config').then(handle);
  },

  // Bu ünvanın mərkəzi (adı); mərkəz yoxdursa 404
  tenant(): Promise<{ name: string }> {
    return fetch(API_BASE + '/tenant').then(handle);
  },

  verifySetupToken(token: string): Promise<{ valid: boolean; name: string; email: string }> {
    return fetch(API_BASE + '/auth/verify-setup-token?token=' + encodeURIComponent(token)).then(handle);
  },

  setupPassword(token: string, password: string): Promise<any> {
    return fetch(API_BASE + '/auth/setup-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).then(handle);
  },

  chooseRole(role: string): Promise<{ token: string; user: EduUser }> {
    return api.raw('/auth/choose-role', { method: 'POST', body: JSON.stringify({ role }) });
  },

  addByCode(code: string): Promise<{ added?: boolean; already?: boolean; user: EduUser }> {
    return api.raw('/auth/add-by-code', { method: 'POST', body: JSON.stringify({ code }) });
  },

  pending(): Promise<{ data: EduUser[] }> {
    return api.raw('/auth/pending');
  },

  approve(id: number): Promise<any> {
    return api.raw('/auth/approve/' + id, { method: 'POST' });
  },
};

// ---------- Media (şəkil / audio) ----------
export function mediaUrl(token: string): string {
  return API_BASE + '/public/media/' + token;
}

export interface MediaItem {
  type: 'image' | 'audio';
  token: string;
  name?: string;
}

export async function uploadMedia(file: File): Promise<MediaItem> {
  const fd = new FormData();
  fd.append('file', file);
  return api.raw('/media', { method: 'POST', body: fd });
}
