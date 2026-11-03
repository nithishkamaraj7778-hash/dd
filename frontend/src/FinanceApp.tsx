import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Archive, ArrowRight, Banknote, BarChart3, CheckCircle2, CircleDollarSign,
  ClipboardList, CreditCard, KeyRound, LayoutDashboard, LogOut, Pencil, Plus, Printer,
  Search, ShieldCheck, User, UserPlus, Users, X,
} from 'lucide-react';
import type {
  Account, Customer, Dashboard, Employee, EmployeeReport, Payment, User as SessionUser,
} from './api';
import { api } from './api';

type Tab = 'dashboard' | 'customers' | 'accounts' | 'payments' | 'employees';
type EntryKind = 'customer' | 'account' | 'payment';
const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);
const date = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entryModal, setEntryModal] = useState<EntryKind | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [employeeReport, setEmployeeReport] = useState<EmployeeReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const isEmployer = user?.role === 'SUPERADMIN';

  const endSession = useCallback(() => {
    localStorage.removeItem('dd_token');
    localStorage.removeItem('dd_user');
    setUser(null);
    setDashboard(null);
    setCustomers([]);
    setAccounts([]);
    setPayments([]);
    setEmployees([]);
  }, []);

  const saveUser = useCallback((nextUser: SessionUser) => {
    localStorage.setItem('dd_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const expireSession = () => endSession();
    window.addEventListener('dd:session-expired', expireSession);
    return () => window.removeEventListener('dd:session-expired', expireSession);
  }, [endSession]);

  useEffect(() => {
    if (!localStorage.getItem('dd_token')) {
      setSessionReady(true);
      return;
    }
    let active = true;
    api.me()
      .then(({ user: currentUser }) => {
        if (active) saveUser(currentUser);
      })
      .catch(() => {
        if (active) endSession();
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, [endSession, saveUser]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [nextDashboard, nextCustomers, nextAccounts, nextPayments] = await Promise.all([
        api.dashboard(),
        api.customers(),
        api.accounts(),
        api.payments(),
      ]);
      setDashboard(nextDashboard);
      setCustomers(nextCustomers);
      setAccounts(nextAccounts);
      setPayments(nextPayments);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load your portfolio');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshEmployees = useCallback(async () => {
    try {
      setEmployees(await api.employees());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load employees');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh();
    if (user.role === 'SUPERADMIN') void refreshEmployees();
  }, [user, refresh, refreshEmployees]);

  useEffect(() => {
    if (!user || tab !== 'customers') return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.customers(customerSearch);
        if (active) setCustomers(result);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to search customers');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerSearch, tab, user]);

  useEffect(() => {
    if (!user || tab !== 'accounts') return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.accounts(accountSearch);
        if (active) setAccounts(result);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to search accounts');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accountSearch, tab, user]);

  if (!sessionReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#102f35] text-sm text-white">Checking your secure session...</div>;
  }
  if (!user) return <AuthScreen onLogin={saveUser} />;
  if (user.mustChangePassword) {
    return <ChangePasswordScreen user={user} onComplete={saveUser} onSignOut={endSession} forced />;
  }

  const nav = [
    { id: 'dashboard' as Tab, label: 'Overview', icon: LayoutDashboard },
    { id: 'customers' as Tab, label: 'Customers', icon: Users },
    { id: 'accounts' as Tab, label: 'Loans & accounts', icon: CreditCard },
    { id: 'payments' as Tab, label: 'Payments', icon: Banknote },
    ...(isEmployer ? [{ id: 'employees' as Tab, label: 'Employees', icon: UserPlus }] : []),
  ];

  const signOut = async () => {
    try {
      await api.logout();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Unable to sign out securely');
    } finally {
      endSession();
    }
  };

  const openEmployeeReport = async (id: string) => {
    try {
      setEmployeeReport(await api.employeeReport(id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load employee report');
    }
  };

  const pageTitle = nav.find((item) => item.id === tab)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#102f35] px-5 py-7 text-white lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign size={23} /></div>
          <div><strong className="block tracking-tight">DD Enterprises</strong><span className="text-xs text-teal-100/60">Finance operations</span></div>
        </div>
        <nav className="mt-14 space-y-2" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${tab === id ? 'bg-white/10 text-[#d3f36b]' : 'text-teal-100/65 hover:bg-white/5 hover:text-white'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <ShieldCheck size={19} className="mb-3 text-[#d3f36b]" />
          <p className="text-xs leading-5 text-teal-100/65">
            {isEmployer ? 'Employer workspace — full access to company records and employee activity.' : `Private employee workspace${user.employeeId ? ` · ${user.employeeId}` : ''}.`}
          </p>
        </div>
      </aside>

      <main className="lg:ml-64">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-5 md:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{isEmployer ? 'Employer portal' : 'Employee portal'}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{tab === 'dashboard' ? 'Portfolio overview' : pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50" aria-label="Open profile and password settings">
              <User size={17} className="text-teal-700" />
              <span className="hidden text-right sm:block"><span className="block text-sm font-semibold">{user.fullName}</span><span className="block text-xs text-slate-500">{isEmployer ? 'Employer' : user.employeeId ?? 'Employee'}</span></span>
            </button>
            <button title="Sign out" onClick={() => void signOut()} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><LogOut size={18} /></button>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white px-5 lg:hidden">
          <div className="flex gap-1 overflow-x-auto py-2">
            {nav.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? 'bg-[#102f35] text-white' : 'text-slate-500'}`}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-7xl p-5 md:p-10">
          {error && <div role="alert" className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={17} /></button></div>}
          {loading && <div className="mb-5 text-sm text-slate-500">Refreshing your portfolio...</div>}

          {tab === 'dashboard' && dashboard && <DashboardView dashboard={dashboard} user={user} employees={employees} onAdd={setEntryModal} onViewEmployees={() => setTab('employees')} />}
          {tab === 'customers' && (
            <ListView title="Customers" subtitle={isEmployer ? 'Company-wide borrower directory' : 'Customers assigned to your workspace'} action="Add customer" icon={Users} onAdd={() => setEntryModal('customer')}>
              <SearchBox value={customerSearch} onChange={setCustomerSearch} placeholder="Search customers..." />
              <CustomerTable customers={customers} onSelect={setSelectedCustomer} />
            </ListView>
          )}
          {tab === 'accounts' && (
            <ListView title="Loans & accounts" subtitle="Track principal, installments, and outstanding balances" action="Create account" icon={CreditCard} onAdd={() => setEntryModal('account')}>
              <SearchBox value={accountSearch} onChange={setAccountSearch} placeholder="Search accounts..." />
              <AccountTable accounts={accounts} onSelect={setSelectedAccount} />
            </ListView>
          )}
          {tab === 'payments' && (
            <ListView title="Payments" subtitle="Receipts and collection history" action="Record payment" icon={Banknote} onAdd={() => setEntryModal('payment')}>
              <PaymentTable payments={payments} />
            </ListView>
          )}
          {tab === 'employees' && isEmployer && (
            <EmployeeManagement
              employees={employees}
              search={employeeSearch}
              onSearch={setEmployeeSearch}
              onRefresh={refreshEmployees}
              onReport={openEmployeeReport}
              onError={setError}
            />
          )}
        </div>
      </main>

      {entryModal && <Modal title={entryModal === 'customer' ? 'Add customer' : entryModal === 'account' ? 'Create loan account' : 'Record payment'} onClose={() => setEntryModal(null)}>
        <EntryForm kind={entryModal} customers={customers} accounts={accounts} employees={employees.filter((employee) => employee.user.isActive && !employee.archivedAt)}
          isEmployer={isEmployer} onDone={async () => { setEntryModal(null); await refresh(); }} onError={setError} />
      </Modal>}
      {profileOpen && <Modal title="Your profile" onClose={() => setProfileOpen(false)}>
        <ProfileForm user={user} onSave={(updated) => { saveUser(updated); setProfileOpen(false); }} onError={setError} />
      </Modal>}
      {selectedCustomer && <Modal title={selectedCustomer.fullName} onClose={() => setSelectedCustomer(null)}>
        <CustomerDetails
          customer={selectedCustomer}
          employees={employees}
          isEmployer={isEmployer}
          onError={setError}
          onAssigned={async (updated) => {
            setSelectedCustomer(updated);
            await refresh();
          }}
        />
      </Modal>}
      {selectedAccount && <Modal title={selectedAccount.accountNumber} onClose={() => setSelectedAccount(null)}>
        <DetailRows rows={[
          ['Customer', selectedAccount.customer.fullName],
          ['Customer ID', selectedAccount.customer.customerId],
          ['Principal', money(selectedAccount.principalAmount)],
          ['Outstanding', money(selectedAccount.outstandingBalance)],
          ['Installment', money(selectedAccount.installmentAmount)],
          ['Status', selectedAccount.status],
        ]} />
      </Modal>}
      {employeeReport && <EmployeeReportModal report={employeeReport} onClose={() => setEmployeeReport(null)} />}
    </div>
  );
}

function AuthScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(form);
      localStorage.setItem('dd_token', result.token);
      onLogin(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#102f35]">
      <div className="hidden w-1/2 flex-col justify-between p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign /></div><strong>DD Enterprises</strong></div>
        <div><p className="mb-5 max-w-lg text-5xl font-semibold leading-[1.08] tracking-tight">Make every rupee easier to follow.</p><p className="max-w-md text-teal-100/60">A secure workspace for customers, lending, and collections.</p></div>
        <p className="text-xs text-teal-100/40">Employer and employee access</p>
      </div>
      <div className="flex w-full items-center justify-center bg-[#f4f7f8] p-6 lg:w-1/2">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl md:p-10">
          <div className="mb-9 lg:hidden"><div className="mb-4 inline-flex rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign /></div><h1 className="text-2xl font-semibold">DD Enterprises</h1></div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Secure sign in</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Use the credentials provided for your account.</p>
          {error && <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          <div className="mt-7 space-y-4">
            <Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} autoComplete="username" />
            <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} autoComplete="current-password" />
          </div>
          <button disabled={busy} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#102f35] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#17444b] disabled:opacity-60">
            {busy ? 'Please wait...' : 'Sign in'}<ArrowRight size={17} />
          </button>
          <p className="mt-5 text-center text-xs text-slate-400">Employee accounts are created by your employer.</p>
        </form>
      </div>
    </div>
  );
}

function ChangePasswordScreen({
  user, onComplete, onSignOut, forced = false,
}: {
  user: SessionUser;
  onComplete: (user: SessionUser) => void;
  onSignOut: () => void;
  forced?: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.changePassword({ currentPassword, newPassword });
      localStorage.setItem('dd_token', result.token);
      onComplete(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f8] p-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl md:p-10">
        <div className="mb-5 inline-flex rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><KeyRound /></div>
        <h1 className="text-2xl font-semibold">{forced ? 'Set your password' : 'Change password'}</h1>
        <p className="mt-2 text-sm text-slate-500">{forced ? `Welcome, ${user.fullName}. Change your temporary password to continue.` : 'Choose a new password with at least 12 characters.'}</p>
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-4">
          <Field label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
          <Field label="New password (12+ characters)" type="password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} minLength={12} />
        </div>
        <button disabled={busy} className="button-primary mt-6 w-full justify-center disabled:opacity-60">{busy ? 'Saving...' : 'Update password'}<CheckCircle2 size={16} /></button>
        {!forced && <button type="button" onClick={onSignOut} className="mt-4 w-full text-sm text-slate-500 hover:text-slate-800">Sign out</button>}
      </form>
    </div>
  );
}

function DashboardView({
  dashboard, user, employees, onAdd, onViewEmployees,
}: {
  dashboard: Dashboard;
  user: SessionUser;
  employees: Employee[];
  onAdd: (kind: EntryKind) => void;
  onViewEmployees: () => void;
}) {
  const employer = user.role === 'SUPERADMIN';
  const activeEmployees = employees.filter((employee) => employee.user.isActive && !employee.archivedAt).length;
  const inactiveEmployees = employees.length - activeEmployees;
  const maxMonthlyAmount = Math.max(1, ...dashboard.monthlyTrends.map((entry) => entry.total));
  const stats = [
    { label: employer ? 'Total customers' : 'Assigned customers', value: String(dashboard.metrics.customers), icon: Users, accent: 'bg-teal-50 text-teal-700' },
    { label: 'Open accounts', value: String(dashboard.metrics.accounts), icon: CreditCard, accent: 'bg-lime-50 text-lime-700' },
    { label: 'Principal issued', value: money(dashboard.metrics.principal), icon: BarChart3, accent: 'bg-amber-50 text-amber-700' },
    { label: 'Outstanding', value: money(dashboard.metrics.outstanding), icon: ClipboardList, accent: 'bg-rose-50 text-rose-700' },
    { label: employer ? 'Employees' : 'Transactions', value: employer ? String(employees.length) : String(dashboard.metrics.payments), icon: UserPlus, accent: 'bg-sky-50 text-sky-700' },
    { label: employer ? 'Active employees' : 'Recovered', value: employer ? String(activeEmployees) : money(dashboard.metrics.recovered), icon: Banknote, accent: 'bg-emerald-50 text-emerald-700' },
    ...(employer ? [{ label: 'Inactive employees', value: String(inactiveEmployees), icon: ShieldCheck, accent: 'bg-slate-100 text-slate-700' }] : []),
  ];

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-lg font-semibold">Welcome, {user.fullName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {employer ? 'Business-wide financial and employee overview.' : `Your private workspace${user.employeeId ? ` · ${user.employeeId}` : ''}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {employer && <button onClick={onViewEmployees} className="button-secondary"><Users size={16} />Manage employees</button>}
          <button onClick={() => onAdd('customer')} className="button-secondary"><Plus size={16} />Customer</button>
          <button onClick={() => onAdd('payment')} className="button-primary"><Plus size={16} />Payment</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <Stat key={stat.label} {...stat} />)}
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Monthly collections</h2><p className="text-sm text-slate-500">Last six months in your authorized workspace</p></div>
          <div className="flex h-48 items-end gap-3 px-5 py-5">
            {dashboard.monthlyTrends.map((month) => (
              <div key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="max-w-full truncate text-[10px] text-slate-500">{money(month.total)}</span>
                <div className="flex w-full flex-1 items-end"><div title={`${month.month}: ${money(month.total)}`} className="w-full rounded-t-md bg-teal-600" style={{ height: `${Math.max(3, (month.total / maxMonthlyAmount) * 100)}%` }} /></div>
                <span className="text-xs text-slate-500">{month.month}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">{employer ? 'Recent system activity' : 'Your recent activity'}</h2><p className="text-sm text-slate-500">Recorded account and portfolio events</p></div>
          <div className="max-h-60 space-y-3 overflow-y-auto p-5">
            {dashboard.recentLogs.map((activity, index) => <div key={`${activity.timestamp}-${index}`} className="border-l-2 border-teal-500 pl-3">
              <p className="text-sm font-medium">{activity.description}</p>
              <p className="mt-1 text-xs text-slate-500">{activity.user?.fullName ?? 'System'} · {date(activity.timestamp)}</p>
            </div>)}
            {dashboard.recentLogs.length === 0 && <p className="text-sm text-slate-500">No recent activity.</p>}
          </div>
        </section>
      </div>
      {employer && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-semibold">Employee workspaces</h2><p className="text-sm text-slate-500">Assigned customer portfolios</p></div>
            <button onClick={onViewEmployees} className="text-sm font-semibold text-teal-700 hover:text-teal-900">Manage employees <ArrowRight size={15} className="inline" /></button>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {employees.slice(0, 6).map((employee) => (
              <div key={employee.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{employee.user.fullName}</p><p className="text-xs text-slate-500">{employee.employeeId}</p></div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${employee.user.isActive && !employee.archivedAt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{employee.archivedAt ? 'Archived' : employee.user.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">{employee._count?.customers ?? 0} assigned customers</p>
              </div>
            ))}
            {employees.length === 0 && <p className="text-sm text-slate-500">No employee accounts yet.</p>}
          </div>
        </section>
      )}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-semibold">Recent collections</h2><p className="text-sm text-slate-500">Latest payment activity in your authorized workspace</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{dashboard.metrics.payments} total</span>
        </div>
        <PaymentTable payments={dashboard.recentPayments} />
      </section>
    </>
  );
}

function EmployeeManagement({
  employees, search, onSearch, onRefresh, onReport, onError,
}: {
  employees: Employee[];
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => Promise<void>;
  onReport: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busyId, setBusyId] = useState('');

  const resetPassword = async (employee: Employee) => {
    setBusyId(employee.id);
    try {
      const result = await api.resetEmployeePassword(employee.id);
      setTemporaryPassword(`${employee.employeeId}: ${result.temporaryPassword}`);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to reset password');
    } finally {
      setBusyId('');
    }
  };

  const setActive = async (employee: Employee) => {
    setBusyId(employee.id);
    try {
      await api.setEmployeeActive(employee.id, !employee.user.isActive);
      await onRefresh();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to update employee status');
    } finally {
      setBusyId('');
    }
  };

  const archive = async (employee: Employee) => {
    if (!window.confirm(`Archive ${employee.user.fullName}'s account? Existing financial records will be preserved.`)) return;
    setBusyId(employee.id);
    try {
      await api.archiveEmployee(employee.id);
      await onRefresh();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to archive employee');
    } finally {
      setBusyId('');
    }
  };

  const create = async (payload: { username: string; fullName: string; phone?: string; title?: string }) => {
    try {
      const result = await api.createEmployee(payload);
      setCreateOpen(false);
      await onRefresh();
      setTemporaryPassword(`${result.employee.employeeId}: ${result.temporaryPassword}`);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to create employee');
    }
  };

  const update = async (employee: Employee, payload: { username?: string; fullName?: string; phone?: string | null; title?: string | null }) => {
    try {
      await api.updateEmployee(employee.id, payload);
      setEditing(null);
      await onRefresh();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to update employee');
    }
  };

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchingEmployees = employees.filter((employee) => [
    employee.employeeId,
    employee.user.fullName,
    employee.user.username,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)));

  return (
    <section>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="text-lg font-semibold">Employee management</h2><p className="text-sm text-slate-500">Create accounts, manage access, and monitor employee activity.</p></div>
        <button onClick={() => setCreateOpen(true)} className="button-primary"><UserPlus size={16} />Add employee</button>
      </div>
      <SearchBox value={search} onChange={onSearch} placeholder="Search employees by name, username, or employee ID..." />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>
            {['Employee', 'Username', 'Customers', 'Status', 'Actions'].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">{heading}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {matchingEmployees.map((employee) => {
              const archived = Boolean(employee.archivedAt);
              const active = employee.user.isActive && !archived;
              return <tr key={employee.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-4"><p className="font-semibold text-slate-800">{employee.user.fullName}</p><p className="text-xs text-slate-500">{employee.employeeId}{employee.title ? ` · ${employee.title}` : ''}</p></td>
                <td className="px-4 py-4 text-slate-600">{employee.user.username}</td>
                <td className="px-4 py-4 text-slate-600">{employee._count?.customers ?? 0}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${archived ? 'bg-slate-200 text-slate-600' : active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{archived ? 'Archived' : active ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">
                  <ActionButton label="View report" icon={BarChart3} onClick={() => onReport(employee.id)} />
                  {!archived && <ActionButton label="Edit employee" icon={Pencil} onClick={() => setEditing(employee)} />}
                  {!archived && <ActionButton label="Reset password" icon={KeyRound} disabled={busyId === employee.id} onClick={() => void resetPassword(employee)} />}
                  {!archived && <ActionButton label={active ? 'Deactivate employee' : 'Activate employee'} icon={ShieldCheck} disabled={busyId === employee.id} onClick={() => void setActive(employee)} />}
                  {!archived && <ActionButton label="Archive employee" icon={Archive} disabled={busyId === employee.id} onClick={() => void archive(employee)} />}
                </div></td>
              </tr>;
            })}
          </tbody>
        </table>
        {matchingEmployees.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-500">No employee accounts found.</p>}
      </div>
      {createOpen && <Modal title="Create employee account" onClose={() => setCreateOpen(false)}><EmployeeForm onSave={create} onCancel={() => setCreateOpen(false)} /></Modal>}
      {editing && <Modal title={`Edit ${editing.employeeId}`} onClose={() => setEditing(null)}><EmployeeForm employee={editing} onSave={(payload) => update(editing, payload)} onCancel={() => setEditing(null)} /></Modal>}
      {temporaryPassword && <Modal title="Temporary employee password" onClose={() => setTemporaryPassword('')}>
        <p className="text-sm text-slate-600">Share this password securely. It is shown only once and must be changed at the next sign-in.</p>
        <div className="my-5 rounded-xl border border-amber-200 bg-amber-50 p-4 font-mono text-sm font-semibold text-amber-900" role="status">{temporaryPassword}</div>
        <button className="button-primary w-full justify-center" onClick={() => void navigator.clipboard.writeText(temporaryPassword.split(': ').slice(1).join(': '))}>Copy temporary password</button>
      </Modal>}
    </section>
  );
}

function EmployeeForm({
  employee, onSave, onCancel,
}: {
  employee?: Employee;
  onSave: (payload: { username: string; fullName: string; phone?: string; title?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    username: employee?.user.username ?? '',
    fullName: employee?.user.fullName ?? '',
    phone: employee?.phone ?? '',
    title: employee?.title ?? '',
  });
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    await onSave({
      username: form.username,
      fullName: form.fullName,
      phone: form.phone || undefined,
      title: form.title || undefined,
    });
    setBusy(false);
  };
  return <form onSubmit={submit} className="space-y-4">
    <Field label="Full name" value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} />
    <Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} autoComplete="off" />
    <Field label="Job title" value={form.title} onChange={(title) => setForm({ ...form, title })} required={false} />
    <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} required={false} />
    <div className="flex gap-2 pt-2"><button type="button" onClick={onCancel} className="button-secondary flex-1 justify-center">Cancel</button><button disabled={busy} className="button-primary flex-1 justify-center">{busy ? 'Saving...' : employee ? 'Save changes' : 'Create account'}</button></div>
  </form>;
}

function EmployeeReportModal({ report, onClose }: { report: EmployeeReport; onClose: () => void }) {
  const { employee, metrics } = report;
  return <Modal title={`${employee.fullName} · ${employee.employeeId}`} onClose={onClose}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <MiniMetric label="Customers" value={String(metrics.customers)} />
      <MiniMetric label="Transactions" value={String(metrics.transactions)} />
      <MiniMetric label="Principal" value={money(metrics.principal)} />
      <MiniMetric label="Recovered" value={money(metrics.recovered)} />
      <MiniMetric label="This month" value={money(metrics.recoveredThisMonth)} />
      <MiniMetric label="Outstanding" value={money(metrics.outstanding)} />
    </div>
    <h3 className="mb-3 mt-6 font-semibold">Recent activity</h3>
    <div className="max-h-72 space-y-2 overflow-y-auto">
      {report.recentActivity.map((item, index) => <div key={`${item.timestamp}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <p className="text-sm font-medium">{item.description}</p><p className="mt-1 text-xs text-slate-500">{item.action} · {date(item.timestamp)}</p>
      </div>)}
      {report.recentActivity.length === 0 && <p className="text-sm text-slate-500">No activity recorded yet.</p>}
    </div>
  </Modal>;
}

function CustomerDetails({
  customer, employees, isEmployer, onAssigned, onError,
}: {
  customer: Customer;
  employees: Employee[];
  isEmployer: boolean;
  onAssigned: (customer: Customer) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(customer.assignedEmployeeId ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmployeeId(customer.assignedEmployeeId ?? '');
  }, [customer.assignedEmployeeId]);

  const assign = async () => {
    setBusy(true);
    try {
      await onAssigned(await api.assignCustomer(customer.id, employeeId || null));
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to assign customer');
    } finally {
      setBusy(false);
    }
  };

  const assignedEmployee = employees.find((employee) => employee.id === customer.assignedEmployeeId);
  const updateCustomer = async (payload: Record<string, string>) => {
    setBusy(true);
    try {
      await onAssigned(await api.updateCustomer(customer.id, payload));
      setEditing(false);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to update customer');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return <CustomerEditForm customer={customer} busy={busy} onSave={updateCustomer} onCancel={() => setEditing(false)} />;
  }

  return <div className="space-y-5">
    <button onClick={() => setEditing(true)} className="button-secondary w-full justify-center"><Pencil size={15} />Edit customer</button>
    <DetailRows rows={[
      ['Customer ID', customer.customerId],
      ['Phone', customer.phone],
      ['Identity', `${customer.idType}: ${maskDocument(customer.idNumber)}`],
      ['Accounts', String(customer._count?.accounts ?? 0)],
      ['Address', customer.address],
      ...(isEmployer ? [['Assigned employee', assignedEmployee ? `${assignedEmployee.user.fullName} (${assignedEmployee.employeeId})` : 'Unassigned'] as [string, string]] : []),
    ]} />
    {isEmployer && <>
      <Select label="Assign customer to employee" value={employeeId} onChange={setEmployeeId}
        options={employees.filter((employee) => employee.user.isActive && !employee.archivedAt)
          .map((employee) => `${employee.id}|${employee.user.fullName} (${employee.employeeId})`)} required={false} />
      <button disabled={busy || employeeId === (customer.assignedEmployeeId ?? '')} onClick={() => void assign()}
        className="button-primary w-full justify-center disabled:opacity-50">{busy ? 'Saving...' : 'Save assignment'}<CheckCircle2 size={16} /></button>
    </>}
  </div>;
}

function CustomerEditForm({
  customer, busy, onSave, onCancel,
}: {
  customer: Customer;
  busy: boolean;
  onSave: (payload: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    fullName: customer.fullName,
    phone: customer.phone,
    address: customer.address,
    dob: customer.dob?.slice(0, 10) ?? '',
    idType: customer.idType,
    idNumber: customer.idNumber,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(form);
  };
  return <form onSubmit={submit} className="space-y-4">
    <Field label="Full name" value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} />
    <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
    <Field label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} />
    <Field label="Date of birth" type="date" value={form.dob} onChange={(dob) => setForm({ ...form, dob })} />
    <div className="grid grid-cols-2 gap-3">
      <Field label="ID type" value={form.idType} onChange={(idType) => setForm({ ...form, idType })} />
      <Field label="ID number" value={form.idNumber} onChange={(idNumber) => setForm({ ...form, idNumber })} />
    </div>
    <div className="flex gap-2"><button type="button" onClick={onCancel} className="button-secondary flex-1 justify-center">Cancel</button><button disabled={busy} className="button-primary flex-1 justify-center">{busy ? 'Saving...' : 'Save customer'}</button></div>
  </form>;
}

function ProfileForm({
  user, onSave, onError,
}: {
  user: SessionUser;
  onSave: (user: SessionUser) => void;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      let updated = user;
      if (fullName !== user.fullName || phone) {
        updated = await api.updateProfile({ fullName, ...(phone ? { phone } : {}) });
      }
      if (currentPassword || newPassword) {
        if (!currentPassword || !newPassword) throw new Error('Enter both current and new passwords');
        const result = await api.changePassword({ currentPassword, newPassword });
        localStorage.setItem('dd_token', result.token);
        updated = result.user;
      }
      onSave(updated);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to update profile');
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="space-y-4">
    <DetailRows rows={[['Username', user.username], ...(user.employeeId ? [['Employee ID', user.employeeId] as [string, string]] : [])]} />
    <Field label="Full name" value={fullName} onChange={setFullName} />
    {user.role === 'EMPLOYEE' && <Field label="Phone" value={phone} onChange={setPhone} required={false} />}
    <div className="border-t border-slate-100 pt-4"><p className="mb-3 text-sm font-semibold">Change password (optional)</p>
      <div className="space-y-3">
        <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} required={false} />
        <Field label="New password (12+ characters)" type="password" value={newPassword} onChange={setNewPassword} minLength={12} required={false} />
      </div>
    </div>
    <button disabled={busy} className="button-primary w-full justify-center disabled:opacity-60">{busy ? 'Saving...' : 'Save profile'}<CheckCircle2 size={16} /></button>
  </form>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative z-10 mb-5">
    <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100">
      <Search size={18} className="shrink-0 text-slate-400" />
      <input aria-label={placeholder} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
    </div>
  </div>;
}

function ListView({ title, subtitle, action, icon: Icon, onAdd, children }: {
  title: string; subtitle: string; action: string; icon: typeof Users; onAdd: () => void; children: ReactNode;
}) {
  return <section>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-[#dff4d8] p-3 text-teal-800"><Icon size={21} /></div><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div></div>
      <button onClick={onAdd} className="button-primary"><Plus size={16} />{action}</button>
    </div>
    {children}
  </section>;
}

function CustomerTable({ customers, onSelect }: { customers: Customer[]; onSelect: (customer: Customer) => void }) {
  return <Table headers={['Customer', 'Phone', 'Identity', 'Accounts']} rows={customers.map((customer) => [
    <div><strong>{customer.fullName}</strong><small>{customer.customerId}</small></div>,
    customer.phone,
    `${customer.idType}: ${maskDocument(customer.idNumber)}`,
    customer._count?.accounts ?? 0,
  ])} onRowClick={(index) => onSelect(customers[index])} empty="No customers found" />;
}

function AccountTable({ accounts, onSelect }: { accounts: Account[]; onSelect: (account: Account) => void }) {
  return <Table headers={['Account', 'Customer', 'Principal', 'Outstanding', 'Status']} rows={accounts.map((account) => [
    <div><strong>{account.accountNumber}</strong><small>Due {account.nextDueDate ? date(account.nextDueDate) : 'not scheduled'}</small></div>,
    account.customer.fullName,
    money(account.principalAmount),
    money(account.outstandingBalance),
    <span className="status">{account.status}</span>,
  ])} onRowClick={(index) => onSelect(accounts[index])} empty="No loan accounts found" />;
}

function PaymentTable({ payments }: { payments: Payment[] }) {
  const printReceipt = (payment: Payment) => {
    const popup = window.open('', '_blank', 'width=800,height=650');
    if (!popup) {
      window.alert('Allow pop-ups to print the receipt.');
      return;
    }
    popup.opener = null;
    const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
    popup.document.write(`<!doctype html><html><head><title>Receipt ${escape(payment.receiptNumber)}</title>
      <style>body{font:16px Arial,sans-serif;color:#142f34;max-width:680px;margin:48px auto;padding:24px}
      header{border-bottom:2px solid #0f766e;padding-bottom:18px;margin-bottom:24px}
      h1{font-size:24px;margin:0 0 6px}p{color:#64748b;margin:0}
      dl{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      dt{font-size:12px;color:#64748b;text-transform:uppercase;margin-bottom:5px}
      dd{margin:0;font-weight:600}.amount{font-size:24px;color:#0f766e}
      footer{margin-top:42px;border-top:1px solid #cbd5e1;padding-top:16px;color:#64748b;font-size:12px}
      @media print{body{margin:0}}</style></head><body>
      <header><h1>DD Enterprises</h1><p>Payment receipt</p></header>
      <dl><div><dt>Receipt number</dt><dd>${escape(payment.receiptNumber)}</dd></div>
      <div><dt>Payment date</dt><dd>${escape(date(payment.paymentDate))}</dd></div>
      <div><dt>Customer</dt><dd>${escape(payment.customer.fullName)}</dd></div>
      <div><dt>Account</dt><dd>${escape(payment.account.accountNumber)}</dd></div>
      <div><dt>Payment method</dt><dd>${escape(payment.paymentMethod.replaceAll('_', ' '))}</dd></div>
      <div><dt>Amount collected</dt><dd class="amount">${escape(money(payment.amount))}</dd></div></dl>
      <footer>Thank you. This receipt was generated by DD Enterprises.</footer>
      <script>window.addEventListener('load',()=>window.print())</script></body></html>`);
    popup.document.close();
  };
  return <Table headers={['Receipt', 'Customer', 'Account', 'Date', 'Amount', '']} rows={payments.map((payment) => [
    <strong>{payment.receiptNumber}</strong>,
    payment.customer.fullName,
    payment.account.accountNumber,
    date(payment.paymentDate),
    <strong>{money(payment.amount)}</strong>,
    <button onClick={() => printReceipt(payment)} className="button-secondary !px-3 !py-2"><Printer size={15} />Print receipt</button>,
  ])} empty="No payments recorded yet." />;
}

function Table({ headers, rows, empty, onRowClick }: { headers: string[]; rows: ReactNode[][]; empty: string; onRowClick?: (index: number) => void }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-5 py-3 font-semibold">{header}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index} onClick={() => onRowClick?.(index)} className={onRowClick ? 'cursor-pointer hover:bg-teal-50/60' : 'hover:bg-slate-50/70'}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-5 py-4 text-slate-600">{cell}</td>)}</tr>)}</tbody>
    </table>
    {rows.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-500">{empty}</p>}
  </div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function EntryForm({
  kind, customers, accounts, employees, isEmployer, onDone, onError,
}: {
  kind: EntryKind;
  customers: Customer[];
  accounts: Account[];
  employees: Employee[];
  isEmployer: boolean;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (kind === 'customer') await api.createCustomer(form);
      if (kind === 'account') {
        await api.createAccount({
          ...form,
          principalAmount: Number(form.principalAmount),
          interestRate: Number(form.interestRate),
          durationMonths: Number(form.durationMonths),
        });
      }
      if (kind === 'payment') {
        await api.createPayment({
          ...form,
          amount: Number(form.amount),
          paymentDate: form.paymentDate || today(),
          paymentMethod: form.paymentMethod || 'CASH',
        });
      }
      await onDone();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'Unable to save record');
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="space-y-4">
    {kind === 'customer' && <>
      <Field label="Full name" value={form.fullName || ''} onChange={(value) => set('fullName', value)} />
      <Field label="Phone" value={form.phone || ''} onChange={(value) => set('phone', value)} />
      <Field label="Address" value={form.address || ''} onChange={(value) => set('address', value)} />
      <Field label="Date of birth" type="date" value={form.dob || ''} onChange={(value) => set('dob', value)} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="ID type" value={form.idType || ''} onChange={(value) => set('idType', value)} options={['Aadhaar', 'PAN', 'Passport', 'Driving License']} />
        <Field label="ID number" value={form.idNumber || ''} onChange={(value) => set('idNumber', value)} />
      </div>
      {isEmployer && <Select label="Assign to employee" value={form.assignedEmployeeId || ''} onChange={(value) => set('assignedEmployeeId', value)} options={employees.filter((employee) => employee.user.isActive && !employee.archivedAt).map((employee) => `${employee.id}|${employee.user.fullName} (${employee.employeeId})`)} required={false} />}
    </>}
    {kind === 'account' && <>
      <Select label="Customer" value={form.customerId || ''} onChange={(value) => set('customerId', value)} options={customers.map((customer) => `${customer.id}|${customer.fullName} (${customer.customerId})`)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Principal" value={form.principalAmount || ''} onChange={(value) => set('principalAmount', value)} type="number" min={1} />
        <Field label="Annual rate (%)" value={form.interestRate || ''} onChange={(value) => set('interestRate', value)} type="number" min={0} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (months)" value={form.durationMonths || ''} onChange={(value) => set('durationMonths', value)} type="number" min={1} />
        <Select label="Frequency" value={form.paymentFrequency || ''} onChange={(value) => set('paymentFrequency', value)} options={['MONTHLY', 'WEEKLY', 'DAILY']} />
      </div>
      <Select label="Interest type" value={form.interestType || ''} onChange={(value) => set('interestType', value)} options={['SIMPLE', 'FLAT', 'COMPOUND']} />
      <Field label="Start date" type="date" value={form.startDate || ''} onChange={(value) => set('startDate', value)} />
    </>}
    {kind === 'payment' && <>
      <Select label="Account" value={form.accountId || ''} onChange={(value) => set('accountId', value)} options={accounts.map((account) => `${account.id}|${account.accountNumber} — ${account.customer.fullName} (${money(account.outstandingBalance)} due)`)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" value={form.amount || ''} onChange={(value) => set('amount', value)} type="number" min={1} />
        <Field label="Payment date" type="date" value={form.paymentDate || today()} onChange={(value) => set('paymentDate', value)} />
      </div>
      <Select label="Payment method" value={form.paymentMethod || ''} onChange={(value) => set('paymentMethod', value)} options={['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']} />
      <Field label={form.paymentMethod === 'UPI' ? 'Transaction reference' : 'Reference number'} value={form.referenceNumber || ''} onChange={(value) => set('referenceNumber', value)} required={false} />
    </>}
    <button disabled={busy} className="button-primary mt-3 w-full justify-center disabled:opacity-60">{busy ? 'Saving...' : 'Save record'}<CheckCircle2 size={16} /></button>
  </form>;
}

function Select({ label, value, onChange, options, required = true }: {
  label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean;
}) {
  return <label className="block text-sm font-medium text-slate-700">{label}
    <select required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
      <option value="">{required ? 'Choose...' : 'Unassigned'}</option>
      {options.map((option) => {
        const [optionValue, text] = option.includes('|') ? option.split('|') : [option, option];
        return <option key={optionValue} value={optionValue}>{text}</option>;
      })}
    </select>
  </label>;
}

function Field({
  label, value, onChange, type = 'text', required = true, autoComplete, minLength, min,
}: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  required?: boolean; autoComplete?: string; minLength?: number; min?: number;
}) {
  return <label className="block text-sm font-medium text-slate-700">{label}
    <input required={required} type={type} value={value} autoComplete={autoComplete} minLength={minLength} min={min}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
  </label>;
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof BarChart3; accent: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className={`mb-5 inline-flex rounded-xl p-2.5 ${accent}`}><Icon size={19} /></div>
    <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
  </div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>;
}

function ActionButton({ label, icon: Icon, onClick, disabled = false }: {
  label: string; icon: typeof Pencil; onClick: () => void; disabled?: boolean;
}) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-teal-800 disabled:opacity-50"><Icon size={15} /></button>;
}

function DetailRows({ rows }: { rows: [string, string][] }) {
  return <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">{rows.map(([label, value]) => (
    <div key={label} className="flex items-start justify-between gap-5 px-4 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{value}</dd></div>
  ))}</dl>;
}

function maskDocument(value: string) {
  return value.length > 4 ? `XXXX-XXXX-${value.slice(-4)}` : 'XXXX';
}

export default App;
