const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '');

export type User = { id: string; username: string; fullName: string; role: string };
export type AdminUser = { id: string; username: string; fullName: string; role: string; isActive: boolean; createdAt: string };
export type Customer = { id: string; customerId: string; fullName: string; phone: string; address: string; idType: string; idNumber: string; _count?: { accounts: number } };
export type Account = { id: string; accountNumber: string; customerId: string; principalAmount: number; totalPayable: number; amountPaid: number; outstandingBalance: number; installmentAmount: number; status: string; nextDueDate?: string | null; customer: { fullName: string; customerId: string } };
export type Payment = { id: string; receiptNumber: string; amount: number; paymentDate: string; paymentMethod: string; customer: { fullName: string }; account: { accountNumber: string } };
export type Dashboard = { metrics: { customers: number; accounts: number; payments: number; principal: number; outstanding: number }; recentPayments: Payment[] };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error('API is not configured. Set VITE_API_URL to your deployed backend URL and rebuild the frontend.');
  const token = localStorage.getItem('dd_token');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Unable to reach the API. Check VITE_API_URL, backend availability, and CORS configuration.');
    throw error;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new Error('The API returned an invalid response.');
  }

  const message =
    typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message
      : `Request failed (${response.status})`;
  if (!response.ok) throw new Error(message);

  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('The API response is missing its data.');
  }
  return body.data as T;
}

const adminParam = (adminId?: string) => (adminId ? `adminId=${encodeURIComponent(adminId)}` : '');
const qs = (...parts: string[]) => { const p = parts.filter(Boolean).join('&'); return p ? `?${p}` : ''; };

export const api = {
  login: (payload: { username: string; password: string }) => request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload: { username: string; password: string; fullName: string; role: string }) => request<User>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  listAdmins: () => request<AdminUser[]>('/auth/admins'),
  dashboard: (adminId?: string) => request<Dashboard>(`/finance/dashboard${qs(adminParam(adminId))}`),
  customers: (search = '', adminId?: string) => request<Customer[]>(`/finance/customers${qs(search ? `search=${encodeURIComponent(search)}` : '', adminParam(adminId))}`),
  createCustomer: (payload: Record<string, string>) => request<Customer>('/finance/customers', { method: 'POST', body: JSON.stringify(payload) }),
  accounts: (search = '', adminId?: string) => request<Account[]>(`/finance/accounts${qs(search ? `search=${encodeURIComponent(search)}` : '', adminParam(adminId))}`),
  createAccount: (payload: Record<string, string | number>) => request<Account>('/finance/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  payments: (adminId?: string) => request<Payment[]>(`/finance/payments${qs(adminParam(adminId))}`),
  createPayment: (payload: Record<string, string | number>) => request<Payment>('/finance/payments', { method: 'POST', body: JSON.stringify(payload) }),
};