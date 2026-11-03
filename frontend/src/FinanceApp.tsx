import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, Banknote, BarChart3, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, CreditCard, Eye, LayoutDashboard, LogOut, Plus, Search, ShieldAlert, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import type { Account, AdminUser, Customer, Dashboard, Payment, User } from './api';
import { api } from './api';

type Tab = 'dashboard' | 'customers' | 'accounts' | 'payments';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
let openCustomerDetails: ((customer: Customer) => void) | undefined;
let openAccountDetails: ((account: Account) => void) | undefined;

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [modal, setModal] = useState<'customer' | 'account' | 'payment' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Super admin state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [viewingAdminId, setViewingAdminId] = useState<string | undefined>(undefined); // undefined = all
  const isSuperAdmin = user?.role === 'SUPERADMIN';
  const viewingAdmin = admins.find((a) => a.id === viewingAdminId);

  openCustomerDetails = setSelectedCustomer;
  openAccountDetails = setSelectedAccount;

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const adminId = isSuperAdmin ? viewingAdminId : undefined;
      const [nextDashboard, nextCustomers, nextAccounts, nextPayments] = await Promise.all([
        api.dashboard(adminId),
        api.customers('', adminId),
        api.accounts('', adminId),
        api.payments(adminId),
      ]);
      setDashboard(nextDashboard); setCustomers(nextCustomers); setAccounts(nextAccounts); setPayments(nextPayments);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load data'); }
    finally { setLoading(false); }
  }, [isSuperAdmin, viewingAdminId]);

  useEffect(() => {
    const storedUser = localStorage.getItem('dd_user');
    if (!storedUser || !localStorage.getItem('dd_token')) return;

    try {
      const savedUser: unknown = JSON.parse(storedUser);
      if (
        typeof savedUser === 'object'
        && savedUser !== null
        && 'id' in savedUser
        && typeof savedUser.id === 'string'
        && 'username' in savedUser
        && typeof savedUser.username === 'string'
        && 'fullName' in savedUser
        && typeof savedUser.fullName === 'string'
        && 'role' in savedUser
        && typeof savedUser.role === 'string'
      ) {
        setUser(savedUser as User);
        return;
      }
    } catch {
      localStorage.removeItem('dd_user');
      localStorage.removeItem('dd_token');
      return;
    }

    localStorage.removeItem('dd_user');
    localStorage.removeItem('dd_token');
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (user?.role !== 'SUPERADMIN') return;
    let active = true;
    api.listAdmins()
      .then((result) => {
        if (active) setAdmins(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load administrators');
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || tab !== 'customers') return;
    let active = true;
    const adminId = isSuperAdmin ? viewingAdminId : undefined;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.customers(customerSearch, adminId);
        if (active) setCustomers(results);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to search customers');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerSearch, tab, user, isSuperAdmin, viewingAdminId]);

  useEffect(() => {
    if (!user || tab !== 'accounts') return;
    let active = true;
    const adminId = isSuperAdmin ? viewingAdminId : undefined;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.accounts(accountSearch, adminId);
        if (active) setAccounts(results);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to search accounts');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accountSearch, tab, user, isSuperAdmin, viewingAdminId]);

  if (!user) return <AuthScreen onLogin={setUser} />;

  const nav = [
    { id: 'dashboard' as Tab, label: 'Overview', icon: LayoutDashboard },
    { id: 'customers' as Tab, label: 'Customers', icon: Users },
    { id: 'accounts' as Tab, label: 'Loans & accounts', icon: CreditCard },
    { id: 'payments' as Tab, label: 'Payments', icon: Banknote },
  ];
  const signOut = () => { localStorage.removeItem('dd_token'); localStorage.removeItem('dd_user'); setUser(null); };

  return <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#102f35] px-5 py-7 text-white lg:flex"><div className="flex items-center gap-3 px-2"><div className="rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign size={23} /></div><div><strong className="block tracking-tight">DD Enterprises</strong><span className="text-xs text-teal-100/60">Finance operations</span></div></div><nav className="mt-14 space-y-2">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${tab === id ? 'bg-white/10 text-[#d3f36b]' : 'text-teal-100/65 hover:bg-white/5 hover:text-white'}`}><Icon size={18} />{label}</button>)}</nav><div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">{isSuperAdmin ? <><ShieldAlert size={19} className="mb-3 text-[#d3f36b]" /><p className="text-xs leading-5 text-teal-100/65">Super Admin — full access to all admin workspaces.</p></> : <><ShieldCheck size={19} className="mb-3 text-[#d3f36b]" /><p className="text-xs leading-5 text-teal-100/65">Your workspace is connected to the local database.</p></>}</div></aside>
    <main className="lg:ml-64">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-5 md:px-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{tab === 'dashboard' ? 'Good to see you' : nav.find((item) => item.id === tab)?.label}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{tab === 'dashboard' ? 'Portfolio overview' : nav.find((item) => item.id === tab)?.label}</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Super Admin Switcher */}
          {isSuperAdmin && admins.length > 0 && (
            <AdminSwitcher
              admins={admins}
              viewingAdminId={viewingAdminId}
              onChange={setViewingAdminId}
            />
          )}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{user.fullName}</p>
            <p className="text-xs text-slate-500">{user.role}</p>
          </div>
          <button title="Sign out" onClick={signOut} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><LogOut size={18} /></button>
        </div>
      </header>

      {/* Super Admin viewing-as banner */}
      {isSuperAdmin && viewingAdmin && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 md:px-10">
          <Eye size={15} className="shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            Viewing workspace of <strong>{viewingAdmin.fullName}</strong>
            <span className="ml-1.5 text-amber-600">({viewingAdmin.username} · {viewingAdmin.role})</span>
            <button onClick={() => setViewingAdminId(undefined)} className="ml-3 rounded-md px-2 py-0.5 text-xs font-semibold text-amber-700 underline hover:text-amber-900">
              Back to all
            </button>
          </p>
        </div>
      )}
      {isSuperAdmin && !viewingAdmin && (
        <div className="flex items-center gap-3 border-b border-teal-200 bg-teal-50 px-5 py-2.5 md:px-10">
          <ShieldAlert size={15} className="shrink-0 text-teal-600" />
          <p className="text-sm text-teal-800">Viewing <strong>all admins' data</strong> combined. Use the switcher to filter by a specific admin.</p>
        </div>
      )}

      <div className="border-b border-slate-200 bg-white px-5 lg:hidden"><div className="flex gap-1 overflow-x-auto py-2">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? 'bg-[#102f35] text-white' : 'text-slate-500'}`}><Icon size={16} />{label}</button>)}</div></div>
      <div className="mx-auto max-w-7xl p-5 md:p-10">{error && <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button onClick={() => setError('')}><X size={17} /></button></div>}{loading && <div className="mb-5 text-sm text-slate-500">Refreshing your portfolio...</div>}{tab === 'dashboard' && dashboard && <DashboardView dashboard={dashboard} onAdd={setModal} />}{tab === 'customers' && <ListView title="Customers" subtitle="Your borrower directory" action="Add customer" icon={Users} onAdd={() => setModal('customer')}><SearchBox value={customerSearch} onChange={setCustomerSearch} placeholder="Search customers..." suggestions={customers.slice(0, 8).map((customer) => ({ title: customer.fullName, meta: `${customer.customerId} • ${customer.phone}`, item: customer }))} onSelect={setSelectedCustomer} /><CustomerTable customers={customers} /></ListView>}{tab === 'accounts' && <ListView title="Loans & accounts" subtitle="Track principal, installments, and outstanding balances" action="Create account" icon={CreditCard} onAdd={() => setModal('account')}><SearchBox value={accountSearch} onChange={setAccountSearch} placeholder="Search accounts..." suggestions={accounts.slice(0, 8).map((account) => ({ title: account.customer.fullName, meta: `${account.accountNumber} • ${account.status}`, item: account }))} onSelect={setSelectedAccount} /><AccountTable accounts={accounts} /></ListView>}{tab === 'payments' && <ListView title="Payments" subtitle="Receipts and collection history" action="Record payment" icon={Banknote} onAdd={() => setModal('payment')}><PaymentTable payments={payments} /></ListView>}</div>
    </main>
    {modal && <Modal title={modal === 'customer' ? 'Add customer' : modal === 'account' ? 'Create loan account' : 'Record payment'} onClose={() => setModal(null)}><EntryForm kind={modal} customers={customers} accounts={accounts} onDone={async () => { setModal(null); await refresh(); }} onError={setError} /></Modal>}
    {selectedCustomer && <Modal title={selectedCustomer.fullName} onClose={() => setSelectedCustomer(null)}><DetailRows rows={[["Customer ID", selectedCustomer.customerId], ["Phone", selectedCustomer.phone], ["Identity", `${selectedCustomer.idType}: ${maskDocument(selectedCustomer.idNumber)}`], ["Accounts", String(selectedCustomer._count?.accounts ?? 0)], ["Address", selectedCustomer.address]]} /></Modal>}
    {selectedAccount && <Modal title={selectedAccount.accountNumber} onClose={() => setSelectedAccount(null)}><DetailRows rows={[["Customer", selectedAccount.customer.fullName], ["Customer ID", selectedAccount.customer.customerId], ["Principal", money(selectedAccount.principalAmount)], ["Outstanding", money(selectedAccount.outstandingBalance)], ["Installment", money(selectedAccount.installmentAmount)], ["Status", selectedAccount.status]]} /></Modal>}
  </div>;
}

// ─── Super Admin Switcher ──────────────────────────────────────────────────────

function AdminSwitcher({ admins, viewingAdminId, onChange }: { admins: AdminUser[]; viewingAdminId?: string; onChange: (id?: string) => void }) {
  const [open, setOpen] = useState(false);
  const viewing = admins.find((a) => a.id === viewingAdminId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100 transition"
      >
        <Eye size={15} className="text-amber-600" />
        {viewing ? <span className="max-w-[120px] truncate">{viewing.fullName}</span> : <span>All admins</span>}
        <ChevronDown size={14} className={`text-amber-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">View admin workspace</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {/* All admins option */}
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${!viewingAdminId ? 'bg-teal-50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${!viewingAdminId ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                ALL
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">All admins</p>
                <p className="text-xs text-slate-500">Combined view of all data</p>
              </div>
            </button>
            {admins.map((admin) => (
              <button
                key={admin.id}
                onClick={() => { onChange(admin.id); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${viewingAdminId === admin.id ? 'bg-amber-50' : ''}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase ${viewingAdminId === admin.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {admin.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{admin.fullName}</p>
                  <p className="text-xs text-slate-500">{admin.username} · {admin.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ─── Auth Screen ───────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) { const [registering, setRegistering] = useState(false); const [form, setForm] = useState({ username: '', password: '', fullName: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { if (registering) { await api.register({ ...form, role: 'ADMIN' }); setRegistering(false); setError('Account created. Sign in to continue.'); } else { const result = await api.login({ username: form.username, password: form.password }); localStorage.setItem('dd_token', result.token); localStorage.setItem('dd_user', JSON.stringify(result.user)); onLogin(result.user); } } catch (err) { setError(err instanceof Error ? err.message : 'Unable to continue'); } finally { setBusy(false); } }; return <div className="flex min-h-screen bg-[#102f35]"><div className="hidden w-1/2 flex-col justify-between p-12 text-white lg:flex"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign /></div><strong>DD Enterprises</strong></div><div><p className="mb-5 max-w-lg text-5xl font-semibold leading-[1.08] tracking-tight">Make every rupee easier to follow.</p><p className="max-w-md text-teal-100/60">A clear workspace for customers, lending, and collections.</p></div><p className="text-xs text-teal-100/40">Secure local finance operations</p></div><div className="flex w-full items-center justify-center bg-[#f4f7f8] p-6 lg:w-1/2"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl md:p-10"><div className="mb-9 lg:hidden"><div className="mb-4 inline-flex rounded-xl bg-[#d3f36b] p-2 text-[#102f35]"><CircleDollarSign /></div><h1 className="text-2xl font-semibold">DD Enterprises</h1></div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">{registering ? 'First-time setup' : 'Welcome back'}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{registering ? 'Create your workspace' : 'Sign in to continue'}</h1><p className="mt-2 text-sm text-slate-500">{registering ? 'Create the first administrator account.' : 'Use your finance operations account.'}</p>{error && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<div className="mt-7 space-y-4">{registering && <Field label="Full name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />}<Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} /><Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} /></div><button disabled={busy} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#102f35] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#17444b] disabled:opacity-60">{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button><button type="button" onClick={() => { setRegistering(!registering); setError(''); }} className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900">{registering ? 'Back to sign in' : 'Create first admin account'}<UserPlus size={16} /></button></form></div></div>; }

function SearchBox<T>({ value, onChange, placeholder, suggestions, onSelect }: { value: string; onChange: (value: string) => void; placeholder: string; suggestions: { title: string; meta: string; item: T }[]; onSelect: (item: T) => void }) { const [open, setOpen] = useState(false); const [highlighted, setHighlighted] = useState(0); const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setHighlighted((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0))); } else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted((index) => Math.max(index - 1, 0)); } else if (event.key === 'Enter' && open && suggestions[highlighted]) { event.preventDefault(); onSelect(suggestions[highlighted].item); setOpen(false); } else if (event.key === 'Escape') setOpen(false); }; return <div className="relative z-10 mb-5"><div className="flex items-center rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100"><Search size={18} className="shrink-0 text-slate-400" /><input aria-label={placeholder} value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setHighlighted(0); setOpen(true); }} onKeyDown={handleKeyDown} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" />{value && <button type="button" aria-label="Clear search" onClick={() => { onChange(''); setHighlighted(0); setOpen(false); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>}</div>{open && value && <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">{suggestions.length ? suggestions.map((suggestion, index) => <button type="button" key={`${suggestion.meta}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(suggestion.item); setOpen(false); }} className={`block w-full px-4 py-3 text-left ${index === highlighted ? 'bg-teal-50' : 'hover:bg-slate-50'}`}><strong className="block text-sm text-slate-800">{suggestion.title}</strong><span className="text-xs text-slate-500">{suggestion.meta}</span></button>) : <p className="px-4 py-4 text-sm text-slate-500">No results found</p>}</div>}</div>; }
function DetailRows({ rows }: { rows: [string, string][] }) { return <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 px-4 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{value}</dd></div>)}</dl>; }
function maskDocument(value: string) { return value.length > 4 ? `XXXX-XXXX-${value.slice(-4)}` : 'XXXX'; }
function Field({ label, value, onChange, type = 'text', required = true }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block text-sm font-medium text-slate-700">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>; }
function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof BarChart3; accent: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className={`mb-5 inline-flex rounded-xl p-2.5 ${accent}`}><Icon size={19} /></div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p></div>; }
function DashboardView({ dashboard, onAdd }: { dashboard: Dashboard; onAdd: (kind: 'customer' | 'account' | 'payment') => void }) { return <><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">At a glance</h2><p className="mt-1 text-sm text-slate-500">Live position from your connected database.</p></div><div className="flex gap-2"><button onClick={() => onAdd('customer')} className="button-secondary"><Plus size={16} />Customer</button><button onClick={() => onAdd('payment')} className="button-primary"><Plus size={16} />Payment</button></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Active customers" value={String(dashboard.metrics.customers)} icon={Users} accent="bg-teal-50 text-teal-700" /><Stat label="Open accounts" value={String(dashboard.metrics.accounts)} icon={CreditCard} accent="bg-lime-50 text-lime-700" /><Stat label="Principal issued" value={money(dashboard.metrics.principal)} icon={BarChart3} accent="bg-amber-50 text-amber-700" /><Stat label="Outstanding" value={money(dashboard.metrics.outstanding)} icon={ClipboardList} accent="bg-rose-50 text-rose-700" /></div><section className="mt-8 rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold">Recent collections</h2><p className="text-sm text-slate-500">Latest payment activity</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{dashboard.metrics.payments} total</span></div><PaymentTable payments={dashboard.recentPayments} /></section></>; }
function ListView({ title, subtitle, action, icon: Icon, onAdd, children }: { title: string; subtitle: string; action: string; icon: typeof Users; onAdd: () => void; children: ReactNode }) { return <section><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#dff4d8] p-3 text-teal-800"><Icon size={21} /></div><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div></div><button onClick={onAdd} className="button-primary"><Plus size={16} />{action}</button></div>{children}</section>; }
function CustomerTable({ customers, onSelect = openCustomerDetails }: { customers: Customer[]; onSelect?: (customer: Customer) => void }) { return <Table headers={['Customer', 'Phone', 'Identity', 'Accounts']} rows={customers.map((customer) => [<div><strong>{customer.fullName}</strong><small>{customer.customerId}</small></div>, customer.phone, `${customer.idType}: ${maskDocument(customer.idNumber)}`, customer._count?.accounts ?? 0])} onRowClick={onSelect ? (index) => onSelect(customers[index]) : undefined} empty="No results found" />; }
function AccountTable({ accounts, onSelect = openAccountDetails }: { accounts: Account[]; onSelect?: (account: Account) => void }) { return <Table headers={['Account', 'Customer', 'Principal', 'Outstanding', 'Status']} rows={accounts.map((account) => [<div><strong>{account.accountNumber}</strong><small>Due {account.nextDueDate ? date(account.nextDueDate) : 'not scheduled'}</small></div>, account.customer.fullName, money(account.principalAmount), money(account.outstandingBalance), <span className="status">{account.status}</span>])} onRowClick={onSelect ? (index) => onSelect(accounts[index]) : undefined} empty="No results found" />; }
function PaymentTable({ payments }: { payments: Payment[] }) { return <Table headers={['Receipt', 'Customer', 'Account', 'Date', 'Amount']} rows={payments.map((payment) => [<strong>{payment.receiptNumber}</strong>, payment.customer.fullName, payment.account.accountNumber, date(payment.paymentDate), <strong>{money(payment.amount)}</strong>])} empty="No payments recorded yet." />; }
function Table({ headers, rows, empty, onRowClick }: { headers: string[]; rows: ReactNode[][]; empty: string; onRowClick?: (index: number) => void }) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-5 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index} onClick={() => onRowClick?.(index)} className={onRowClick ? 'cursor-pointer hover:bg-teal-50/60' : 'hover:bg-slate-50/70'}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-5 py-4 text-slate-600">{cell}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-500">{empty}</p>}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div>{children}</div></div>; }
function EntryForm({ kind, customers, accounts, onDone, onError }: { kind: 'customer' | 'account' | 'payment'; customers: Customer[]; accounts: Account[]; onDone: () => Promise<void>; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (kind === 'customer') await api.createCustomer(form);
      if (kind === 'account') await api.createAccount({ ...form, principalAmount: Number(form.principalAmount), interestRate: Number(form.interestRate), durationMonths: Number(form.durationMonths) });
      if (kind === 'payment') {
        const paymentMethod = String(form.paymentMethod || 'CASH');
        const nextForm: Record<string, string | number> = {
          ...form,
          amount: Number(form.amount),
          paymentDate: form.paymentDate || today(),
          paymentMethod,
        };
        await api.createPayment(nextForm);
      }

      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {kind === 'customer' && (
        <>
          <Field label="Full name" value={form.fullName || ''} onChange={(value) => set('fullName', value)} />
          <Field label="Phone" value={form.phone || ''} onChange={(value) => set('phone', value)} />
          <Field label="Address" value={form.address || ''} onChange={(value) => set('address', value)} />
          <Field label="Date of birth" type="date" value={form.dob || ''} onChange={(value) => set('dob', value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="ID type" value={form.idType || ''} onChange={(value) => set('idType', value)} options={['Aadhaar', 'PAN', 'Passport', 'Driving License']} />
            <Field label="ID number" value={form.idNumber || ''} onChange={(value) => set('idNumber', value)} />
          </div>
        </>
      )}

      {kind === 'account' && (
        <>
          <Select label="Customer" value={form.customerId || ''} onChange={(value) => set('customerId', value)} options={customers.map((customer) => `${customer.id}|${customer.fullName} (${customer.customerId})`)} values={customers.map((customer) => customer.id)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal" value={form.principalAmount || ''} onChange={(value) => set('principalAmount', value)} type="number" />
            <Field label="Annual rate (%)" value={form.interestRate || ''} onChange={(value) => set('interestRate', value)} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (months)" value={form.durationMonths || ''} onChange={(value) => set('durationMonths', value)} type="number" />
            <Select label="Frequency" value={form.paymentFrequency || ''} onChange={(value) => set('paymentFrequency', value)} options={['MONTHLY', 'WEEKLY', 'DAILY']} />
          </div>
          <Select label="Interest type" value={form.interestType || ''} onChange={(value) => set('interestType', value)} options={['SIMPLE', 'FLAT', 'COMPOUND']} />
          <Field label="Start date" type="date" value={form.startDate || ''} onChange={(value) => set('startDate', value)} />
        </>
      )}

      {kind === 'payment' && (
        <>
          <Select label="Account" value={form.accountId || ''} onChange={(value) => set('accountId', value)} options={accounts.map((account) => `${account.id}|${account.accountNumber} - ${account.customer.fullName} (${money(account.outstandingBalance)} due)`)} values={accounts.map((account) => account.id)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" value={form.amount || ''} onChange={(value) => set('amount', value)} type="number" />
            <Field label="Payment date" type="date" value={form.paymentDate || today()} onChange={(value) => set('paymentDate', value)} />
          </div>
          <Select label="Payment method" value={form.paymentMethod || ''} onChange={(value) => set('paymentMethod', value)} options={['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']} />

          {form.paymentMethod === 'UPI' && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-teal-900">UPI transfer details</p>
                  <p className="text-xs text-teal-700">Add the reference number for a completed transfer.</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700">UPI</span>
              </div>
              <Field label="Transaction reference" value={form.referenceNumber || ''} onChange={(value) => set('referenceNumber', value)} required={false} />
            </div>
          )}

          {form.paymentMethod && form.paymentMethod !== 'UPI' && (
            <Field label="Reference number" value={form.referenceNumber || ''} onChange={(value) => set('referenceNumber', value)} required={false} />
          )}
        </>
      )}

      <button disabled={busy} className="button-primary mt-3 w-full justify-center disabled:opacity-60">
        {busy ? 'Saving...' : 'Save record'}
        <CheckCircle2 size={16} />
      </button>
    </form>
  );
}


function Select({ label, value, onChange, options, values }: { label: string; value: string; onChange: (value: string) => void; options: string[]; values?: string[] }) { return <label className="block text-sm font-medium text-slate-700">{label}<select required value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"><option value="">Choose...</option>{options.map((option, index) => { const [optionValue, text] = option.includes('|') ? option.split('|') : [values?.[index] || option, option]; return <option key={optionValue} value={optionValue}>{text}</option>; })}</select></label>; }

export default App;