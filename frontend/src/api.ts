const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '');

export type User = {
  id: string;
  username: string;
  fullName: string;
  role: 'SUPERADMIN' | 'EMPLOYEE';
  employeeId?: string;
  phone?: string | null;
  mustChangePassword: boolean;
};

export type Employee = {
  id: string;
  employeeId: string;
  title: string | null;
  phone: string | null;
  archivedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    isActive: boolean;
    createdAt: string;
  };
  _count?: { customers: number };
};

export type EmployeeReport = {
  employee: Employee['user'] & {
    employeeId: string;
    title: string | null;
    phone: string | null;
    archivedAt: string | null;
  };
  metrics: {
    customers: number;
    accounts: number;
    principal: number;
    outstanding: number;
    transactions: number;
    recovered: number;
    recoveredThisMonth: number;
  };
  recentActivity: {
    action: string;
    entity: string;
    description: string;
    timestamp: string;
  }[];
};

export type Customer = {
  id: string;
  customerId: string;
  fullName: string;
  phone: string;
  address: string;
  idType: string;
  idNumber: string;
  dob?: string;
  altPhone?: string | null;
  notes?: string | null;
  assignedEmployeeId?: string | null;
  _count?: { accounts: number };
};
export type Account = {
  id: string;
  accountNumber: string;
  customerId: string;
  principalAmount: number;
  totalPayable: number;
  amountPaid: number;
  outstandingBalance: number;
  installmentAmount: number;
  status: string;
  nextDueDate?: string | null;
  customer: { fullName: string; customerId: string };
};
export type Payment = {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  customer: { fullName: string };
  account: { accountNumber: string };
};
export type Dashboard = {
  metrics: {
    customers: number;
    accounts: number;
    payments: number;
    principal: number;
    outstanding: number;
    recovered: number;
  };
  recentPayments: Payment[];
  monthlyTrends: { month: string; total: number }[];
  recentLogs: {
    action: string;
    description: string;
    timestamp: string;
    user: { fullName: string; username: string } | null;
  }[];
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('dd_token');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the API. Check VITE_API_URL, backend availability, and CORS configuration.');
    }
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
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('dd:session-expired'));
    throw new Error(message);
  }

  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('The API response is missing its data.');
  }
  return body.data as T;
}

export const api = {
  login: (payload: { username: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ token: string; user: User }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProfile: (payload: { fullName?: string; phone?: string | null }) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  employees: (search = '') =>
    request<Employee[]>(`/employees${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createEmployee: (payload: { username: string; fullName: string; phone?: string; title?: string }) =>
    request<{ employee: Employee; temporaryPassword: string }>('/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateEmployee: (id: string, payload: { username?: string; fullName?: string; phone?: string | null; title?: string | null }) =>
    request<Employee>(`/employees/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setEmployeeActive: (id: string, isActive: boolean) =>
    request<Employee>(`/employees/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  archiveEmployee: (id: string) =>
    request<Employee>(`/employees/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetEmployeePassword: (id: string) =>
    request<{ temporaryPassword: string }>(`/employees/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
    }),
  employeeReport: (id: string) =>
    request<EmployeeReport>(`/employees/${encodeURIComponent(id)}/report`),
  assignCustomer: (customerId: string, employeeId: string | null) =>
    request<Customer>(`/finance/customers/${encodeURIComponent(customerId)}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({ employeeId }),
    }),
  dashboard: () => request<Dashboard>('/finance/dashboard'),
  customers: (search = '') =>
    request<Customer[]>(`/finance/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createCustomer: (payload: Record<string, string>) =>
    request<Customer>('/finance/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: string, payload: Record<string, string>) =>
    request<Customer>(`/finance/customers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  accounts: (search = '') =>
    request<Account[]>(`/finance/accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createAccount: (payload: Record<string, string | number>) =>
    request<Account>('/finance/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  payments: () => request<Payment[]>('/finance/payments'),
  createPayment: (payload: Record<string, string | number>) =>
    request<Payment>('/finance/payments', { method: 'POST', body: JSON.stringify(payload) }),
};
