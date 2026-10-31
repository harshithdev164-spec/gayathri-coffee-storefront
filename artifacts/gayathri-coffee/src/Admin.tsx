import { createContext, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Plus, Trash2, X, Check, LogOut, ImagePlus, Package, Truck, Settings as SettingsIcon, BarChart3, MapPin, Phone, StickyNote, ExternalLink, Send, MessageCircle, ArrowRight, Users } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  PieChart,
  Pie,
  Cell,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  useAdminLogin,
  useAdminRequestOtp,
  useAdminVerifyOtp,
  useAdminLogout,
  useAdminMe,
  useAdminListProducts,
  useAdminCreateProduct,
  useAdminUpdateProduct,
  useAdminDeleteProduct,
  useAdminAddProductImage,
  useAdminDeleteProductImage,
  useAdminListOrders,
  useAdminUpdateOrder,
  useAdminShipOrder,
  useAdminGetSettings,
  useAdminUpdateSettings,
  useAdminGetStats,
  useAdminListPackingRecipients,
  useAdminCreatePackingRecipient,
  useAdminDeletePackingRecipient,
  getAdminMeQueryKey,
  getAdminListProductsQueryKey,
  getAdminListOrdersQueryKey,
  getAdminGetSettingsQueryKey,
  getAdminGetStatsQueryKey,
  getAdminListPackingRecipientsQueryKey,
  type ProductWithDetails,
  type OrderWithItems,
} from '@workspace/api-client-react';

const logoPath = '/mysore-heritage-logo.jpeg';

const PRODUCT_CATEGORIES = ['Coffee Powder', 'Premium Coffee', 'Pure Coffee', 'Decoction', 'Tea'];

function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#fdf8f1] text-[#67232d]">
      <div className="pattern-bg" style={{ '--pattern-opacity': '.04' } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

// What the logged-in person may do, as sent by the server (the server enforces it too - hiding things
// here only keeps the screen tidy).
const PermsContext = createContext<string[]>([]);
function useCan() {
  const perms = useContext(PermsContext);
  return (...anyOf: string[]) => anyOf.some((permission) => perms.includes(permission));
}

type AdminTab = 'products' | 'orders' | 'whatsapp' | 'analytics' | 'settings' | 'team';

const ALL_TABS: { id: AdminTab; label: string; icon: typeof Package; needs: string[] }[] = [
  { id: 'orders', label: 'Orders', icon: Truck, needs: ['orders.view'] },
  { id: 'products', label: 'Products', icon: Package, needs: ['products'] },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, needs: ['whatsapp'] },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, needs: ['analytics'] },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, needs: ['settings', 'packing'] },
  { id: 'team', label: 'Team', icon: Users, needs: ['users'] },
];

function AdminTabs({ tab, onChange }: { tab: AdminTab; onChange: (tab: AdminTab) => void }) {
  const can = useCan();
  const tabs = ALL_TABS.filter((t) => can(...t.needs));
  return (
    <div className="border-b border-[#decdb9] bg-[#fdf8f1]">
      <div className="mx-auto flex max-w-[1100px] gap-1 px-5 sm:px-8">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-[.12em] transition-colors ${tab === id ? 'border-[#b83a36] text-[#67232d]' : 'border-transparent text-[#9a7564] hover:text-[#67232d]'}`}
            data-testid={`tab-admin-${id}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

type WalletInfo = { connected: boolean; balance: number | null; lowBalanceAt: number; low: boolean; checkedAt: string | null };

// Shiprocket wallet balance, always visible at the top of the admin. Turns red when it is too low to book
// more parcels. Re-checked every 5 minutes, and on demand.
function WalletChip() {
  const can = useCan();
  const queryClient = useQueryClient();
  const allowed = can('wallet', 'orders.ship');
  const { data, isError, isFetching } = useQuery({
    queryKey: ['shiprocket-wallet'],
    queryFn: async () => {
      const res = await fetch('/api/admin/shiprocket/wallet', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('wallet');
      return (await res.json()) as WalletInfo;
    },
    enabled: allowed,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  if (!allowed || (data && !data.connected)) return null;
  const refresh = async () => {
    const res = await fetch('/api/admin/shiprocket/wallet?refresh=1', { credentials: 'same-origin' });
    if (res.ok) queryClient.setQueryData(['shiprocket-wallet'], await res.json());
  };
  const low = Boolean(data?.low);
  return (
    <button
      type="button"
      onClick={() => void refresh()}
      title={data?.checkedAt ? `Checked ${new Date(data.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - click to refresh` : 'Click to refresh'}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${low ? 'border-[#b83a36] bg-[#b83a36]/10 text-[#b83a36]' : 'border-[#decdb9] text-[#67232d]'}`}
      data-testid="chip-shiprocket-wallet"
    >
      <Truck size={13} />
      {isError ? 'Wallet unavailable' : data?.balance == null ? 'Wallet…' : `Shiprocket wallet ₹${data.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
      {low ? <span className="rounded-full bg-[#b83a36] px-2 py-0.5 text-[10px] uppercase tracking-[.08em] text-[#fdf8f1]">Low - top up</span> : null}
      {isFetching ? <span className="text-[10px] font-normal text-[#9a7564]">…</span> : null}
    </button>
  );
}

function AdminHeader({ email, name, role }: { email: string; name?: string | null; role: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const logout = useAdminLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getAdminMeQueryKey(), undefined);
        navigate('/admin/login');
      },
    },
  });

  return (
    <header className="border-b border-[#decdb9] bg-[#fdf8f1]/95 px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Gayathri Coffee</p>
          <h1 className="serif text-2xl text-[#67232d]">Admin</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <WalletChip />
          <span className="text-xs text-[#9a7564]">{name ? `${name} · ` : ''}{email} · <span className="font-semibold capitalize text-[#67232d]" data-testid="text-admin-role">{role}</span></span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="flex items-center gap-1.5 rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold uppercase tracking-[.12em] text-[#775e53] hover:border-[#c9a15a]"
            data-testid="button-admin-logout"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>
    </header>
  );
}

type LoginMethod = 'password' | 'otp';
type OtpStage = 'request' | 'verify';

export function AdminLoginPage() {
  const [, navigate] = useLocation();
  const [method, setMethod] = useState<LoginMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpStage, setOtpStage] = useState<OtpStage>('request');
  const [code, setCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const onAuthenticated = (data: { email: string }) => {
    queryClient.setQueryData(getAdminMeQueryKey(), data);
    navigate('/admin');
  };

  const login = useAdminLogin({ mutation: { onSuccess: onAuthenticated } });

  const requestOtp = useAdminRequestOtp({
    mutation: {
      onSuccess: (data) => {
        setOtpStage('verify');
        setOtpNotice(data.sent ? 'Code sent — check WhatsApp.' : "Couldn't send a code to that account. Try password sign-in instead.");
      },
    },
  });

  const verifyOtp = useAdminVerifyOtp({ mutation: { onSuccess: onAuthenticated } });

  const switchMethod = (next: LoginMethod) => {
    setMethod(next);
    setOtpStage('request');
    setCode('');
    setOtpNotice(null);
  };

  return (
    <AdminShell>
      <div className="grid min-h-[100dvh] place-items-center px-5">
        <div className="w-full max-w-[380px] rounded-[1.5rem] border border-[#decdb9] bg-white p-8">
          <img src={logoPath} alt="" className="mx-auto h-14 w-14 rounded-full object-cover" />
          <h1 className="serif mt-4 text-center text-2xl text-[#67232d]">Admin sign in</h1>

          <div className="mt-6 flex rounded-full border border-[#decdb9] p-1 text-xs font-semibold uppercase tracking-[.1em]">
            <button
              type="button"
              onClick={() => switchMethod('password')}
              className={`flex-1 rounded-full py-2 ${method === 'password' ? 'bg-[#67232d] text-[#f9e7c5]' : 'text-[#9a7564]'}`}
              data-testid="button-login-method-password"
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => switchMethod('otp')}
              className={`flex-1 rounded-full py-2 ${method === 'otp' ? 'bg-[#67232d] text-[#f9e7c5]' : 'text-[#9a7564]'}`}
              data-testid="button-login-method-otp"
            >
              WhatsApp code
            </button>
          </div>

          {method === 'password' ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                login.mutate({ data: { email, password } });
              }}
            >
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none"
                  data-testid="input-admin-email"
                />
              </label>
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none"
                  data-testid="input-admin-password"
                />
              </label>
              {login.isError ? <p className="text-xs text-[#b83a36]">Invalid email or password.</p> : null}
              <button
                type="submit"
                disabled={login.isPending}
                className="w-full rounded-full bg-[#67232d] px-5 py-3 text-sm font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60"
                data-testid="button-admin-login-submit"
              >
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : otpStage === 'request' ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                requestOtp.mutate({ data: { email } });
              }}
            >
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none"
                  data-testid="input-admin-otp-email"
                />
              </label>
              <p className="text-xs text-[#9a7564]">We'll send a 6-digit code to the admin WhatsApp number on file.</p>
              <button
                type="submit"
                disabled={requestOtp.isPending}
                className="w-full rounded-full bg-[#67232d] px-5 py-3 text-sm font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60"
                data-testid="button-request-otp"
              >
                {requestOtp.isPending ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                verifyOtp.mutate({ data: { email, code } });
              }}
            >
              {otpNotice ? <p className="text-xs text-[#9a7564]">{otpNotice}</p> : null}
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">6-digit code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-center text-lg tracking-[.4em] text-[#67232d] outline-none"
                  data-testid="input-otp-code"
                />
              </label>
              {verifyOtp.isError ? <p className="text-xs text-[#b83a36]">{verifyOtp.error instanceof Error ? verifyOtp.error.message : 'Invalid or expired code.'}</p> : null}
              <button
                type="submit"
                disabled={verifyOtp.isPending || code.length !== 6}
                className="w-full rounded-full bg-[#67232d] px-5 py-3 text-sm font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60"
                data-testid="button-verify-otp"
              >
                {verifyOtp.isPending ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setOtpStage('request'); setCode(''); }}
                className="w-full text-center text-xs font-semibold uppercase tracking-[.1em] text-[#9a7564]"
                data-testid="button-otp-back"
              >
                Use a different email / resend
              </button>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

type VariantDraft = { id?: string; weightGrams: number; price: number; sku: string; stockQty: number; isDefault: boolean };

type ProductDraft = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  category: string;
  roast: string;
  notes: string;
  badge: string;
  active: boolean;
  variants: VariantDraft[];
};

function blankDraft(): ProductDraft {
  return {
    slug: '',
    name: '',
    shortName: '',
    description: '',
    category: PRODUCT_CATEGORIES[0],
    roast: '',
    notes: '',
    badge: '',
    active: true,
    variants: [{ weightGrams: 500, price: 0, sku: '', stockQty: 0, isDefault: true }],
  };
}

function draftFromProduct(product: ProductWithDetails): ProductDraft {
  return {
    slug: product.slug,
    name: product.name,
    shortName: product.shortName,
    description: product.description,
    category: product.category,
    roast: product.roast,
    notes: product.notes,
    badge: product.badge ?? '',
    active: product.active,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      weightGrams: variant.weightGrams,
      price: variant.price,
      sku: variant.sku ?? '',
      stockQty: variant.stockQty,
      isDefault: variant.isDefault,
    })),
  };
}

// Price of a pack from the price of 1 kg (or 1 litre), rounded to the nearest 1, 5 or 10 rupees.
function priceFromPerKg(perKg: number, grams: number, roundTo: number): number {
  if (!(perKg > 0) || !(grams > 0)) return 0;
  const raw = (perKg * grams) / 1000;
  return Math.max(0, Math.round(raw / roundTo) * roundTo);
}

// For an existing product: the 1 kg price if it has one, otherwise worked back from its default pack.
function perKgFromVariants(variants: VariantDraft[]): number {
  const oneKg = variants.find((v) => v.weightGrams === 1000 && v.price > 0);
  if (oneKg) return oneKg.price;
  const base = variants.find((v) => v.isDefault && v.price > 0 && v.weightGrams > 0) ?? variants.find((v) => v.price > 0 && v.weightGrams > 0);
  return base ? Math.round((base.price * 1000) / base.weightGrams) : 0;
}

function ProductEditor({
  product,
  onClose,
}: {
  product: ProductWithDetails | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProductDraft>(product ? draftFromProduct(product) : blankDraft());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set the price of 1 kg once; every other weight is worked out from it. New products start in this mode;
  // existing products keep their hand-set prices until it is switched on.
  const [perKg, setPerKg] = useState<number>(() => (product ? perKgFromVariants(draftFromProduct(product).variants) : 0));
  const [autoPrice, setAutoPrice] = useState<boolean>(!product);
  const [roundTo, setRoundTo] = useState<number>(1);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
  const describeError = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

  const createProduct = useAdminCreateProduct({
    mutation: {
      onSuccess: () => { setSaveError(null); invalidate(); onClose(); },
      onError: (err) => setSaveError(describeError(err)),
    },
  });
  const updateProduct = useAdminUpdateProduct({
    mutation: {
      onSuccess: () => { setSaveError(null); invalidate(); },
      onError: (err) => setSaveError(describeError(err)),
    },
  });
  const addImage = useAdminAddProductImage({ mutation: { onSuccess: () => invalidate() } });
  const deleteImage = useAdminDeleteProductImage({ mutation: { onSuccess: () => invalidate() } });

  const saving = createProduct.isPending || updateProduct.isPending;

  const setField = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Re-price every weight whenever the per-kg price, the rounding, or a weight changes.
  const weightsKey = draft.variants.map((v) => v.weightGrams).join(',');
  useEffect(() => {
    if (!autoPrice || !(perKg > 0)) return;
    setDraft((current) => {
      const next = current.variants.map((v) => ({ ...v, price: priceFromPerKg(perKg, v.weightGrams, roundTo) }));
      return next.every((v, i) => v.price === current.variants[i]!.price) ? current : { ...current, variants: next };
    });
  }, [autoPrice, perKg, roundTo, weightsKey]);

  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)),
    }));

  const addVariant = () =>
    setDraft((current) => ({
      ...current,
      variants: [...current.variants, { weightGrams: 500, price: 0, sku: '', stockQty: 0, isDefault: false }],
    }));

  const removeVariant = (index: number) =>
    setDraft((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      shortName: draft.shortName.trim(),
      description: draft.description.trim(),
      category: draft.category,
      roast: draft.roast.trim(),
      notes: draft.notes.trim(),
      badge: draft.badge.trim() || null,
      active: draft.active,
      variants: draft.variants.map((variant) => ({
        id: variant.id,
        weightGrams: variant.weightGrams,
        price: variant.price,
        sku: variant.sku.trim() || null,
        stockQty: variant.stockQty,
        isDefault: variant.isDefault,
      })),
    };

    if (product) {
      updateProduct.mutate({ id: product.id, data: payload });
    } else {
      createProduct.mutate({ data: payload });
    }
  };

  const handleUpload = async (file: File) => {
    if (!product) return;
    setUploading(true);
    setUploadError(null);
    try {
      const presignRes = await fetch('/api/admin/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
      });
      if (!presignRes.ok) throw new Error('Could not get an upload URL');
      const { uploadUrl, objectKey } = await presignRes.json();

      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error('Upload failed');

      addImage.mutate({ id: product.id, data: { objectKey, isPrimary: product.images.length === 0 } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#3a161e]/45 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet-in flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fdf8f1] sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#decdb9] px-6 py-4">
          <h2 className="serif text-xl text-[#67232d]">{product ? 'Edit product' : 'New product'}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#67232d] hover:bg-[#efe1d2]" data-testid="button-close-editor">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Name</span>
              <input required value={draft.name} onChange={(e) => setField('name', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-name" />
            </label>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Slug</span>
              <input required value={draft.slug} onChange={(e) => setField('slug', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-slug" />
            </label>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Short name</span>
              <input required value={draft.shortName} onChange={(e) => setField('shortName', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-short-name" />
            </label>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Category</span>
              <select value={draft.category} onChange={(e) => setField('category', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="select-product-category">
                {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Roast</span>
              <input required value={draft.roast} onChange={(e) => setField('roast', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-roast" />
            </label>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Badge (optional)</span>
              <input value={draft.badge} onChange={(e) => setField('badge', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-badge" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Description</span>
              <textarea required value={draft.description} onChange={(e) => setField('description', e.target.value)} className="mt-2 min-h-[70px] w-full border border-[#decdb9] bg-transparent p-3 text-sm outline-none" data-testid="input-product-description" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Cup notes</span>
              <input required value={draft.notes} onChange={(e) => setField('notes', e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-product-notes" />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={draft.active} onChange={(e) => setField('active', e.target.checked)} data-testid="checkbox-product-active" />
              <span className="text-sm text-[#67232d]">Visible on the storefront</span>
            </label>
          </div>

          <div className="mt-6 border-t border-[#decdb9] pt-5">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">{draft.category === 'Decoction' ? 'Volume & price' : 'Weight & price'}</p>
              <button type="button" onClick={addVariant} className="flex items-center gap-1 text-xs font-semibold text-[#b83a36]" data-testid="button-add-variant">
                <Plus size={14} /> {draft.category === 'Decoction' ? 'Add volume' : 'Add weight'}
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-[#c9a15a]/50 bg-[#c9a15a]/10 p-3" data-testid="box-per-kg-pricing">
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className="block">
                  <span className="mono text-[9px] uppercase text-[#9a7564]">{draft.category === 'Decoction' ? 'Price per 1 litre (₹)' : 'Price per 1 kg (₹)'}</span>
                  <input type="number" min={0} value={perKg || ''} onChange={(e) => setPerKg(Number(e.target.value))} placeholder="e.g. 800" className="w-full bg-transparent text-sm outline-none" data-testid="input-price-per-kg" />
                </label>
                <label className="block">
                  <span className="mono text-[9px] uppercase text-[#9a7564]">Round to</span>
                  <select value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))} className="bg-transparent text-sm outline-none" data-testid="select-price-rounding">
                    <option value={1}>nearest ₹1</option>
                    <option value={5}>nearest ₹5</option>
                    <option value={10}>nearest ₹10</option>
                  </select>
                </label>
              </div>
              <label className="mt-2 flex items-start gap-2 text-xs text-[#775e53]">
                <input type="checkbox" checked={autoPrice} onChange={(e) => setAutoPrice(e.target.checked)} className="mt-0.5" data-testid="checkbox-auto-price" />
                <span>Calculate the price of every {draft.category === 'Decoction' ? 'volume' : 'weight'} from this {draft.category === 'Decoction' ? 'per-litre' : 'per-kg'} price{autoPrice && !(perKg > 0) ? ' - enter the price above' : ''}. Untick to type each price by hand.</span>
              </label>
            </div>
            <div className="mt-3 space-y-3">
              {draft.variants.map((variant, index) => (
                <div key={variant.id ?? index} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 rounded-xl border border-[#decdb9] bg-white p-3">
                  <label className="block">
                    <span className="mono text-[9px] uppercase text-[#9a7564]">{draft.category === 'Decoction' ? 'Millilitres' : 'Grams'}</span>
                    <input type="number" min={1} required value={variant.weightGrams} onChange={(e) => setVariant(index, { weightGrams: Number(e.target.value) })} className="w-full bg-transparent text-sm outline-none" data-testid={`input-variant-grams-${index}`} />
                  </label>
                  <label className="block">
                    <span className="mono text-[9px] uppercase text-[#9a7564]">Price (₹)</span>
                    <input type="number" min={0} required value={variant.price} readOnly={autoPrice && perKg > 0} onChange={(e) => setVariant(index, { price: Number(e.target.value) })} className={`w-full bg-transparent text-sm outline-none ${autoPrice && perKg > 0 ? 'text-[#8a5a2b]' : ''}`} title={autoPrice && perKg > 0 ? 'Worked out from the per-kg price' : undefined} data-testid={`input-variant-price-${index}`} />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-[#775e53]">
                    <input type="checkbox" checked={variant.isDefault} onChange={(e) => setVariant(index, { isDefault: e.target.checked })} />
                    Default
                  </label>
                  <button type="button" onClick={() => removeVariant(index)} disabled={draft.variants.length === 1} className="grid size-8 place-items-center rounded-full text-[#b83a36] disabled:opacity-30" data-testid={`button-remove-variant-${index}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {product ? (
            <div className="mt-6 border-t border-[#decdb9] pt-5">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Photos</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {product.images.map((image) => (
                  <div key={image.id} className="group relative size-20 overflow-hidden rounded-xl border border-[#decdb9] bg-white">
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => deleteImage.mutate({ id: product.id, imageId: image.id })}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 text-[#b83a36] opacity-0 transition-opacity group-hover:opacity-100"
                      data-testid={`button-remove-image-${image.id}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <label className="grid size-20 cursor-pointer place-items-center rounded-xl border border-dashed border-[#c9a15a] text-[#9a7564] hover:bg-[#f1e5d8]">
                  {uploading ? <span className="text-[10px]">Uploading…</span> : <ImagePlus size={20} />}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                      e.target.value = '';
                    }}
                    data-testid="input-upload-image"
                  />
                </label>
              </div>
              {uploadError ? <p className="mt-2 text-xs text-[#b83a36]">{uploadError}</p> : null}
            </div>
          ) : (
            <p className="mt-6 border-t border-[#decdb9] pt-5 text-xs text-[#9a7564]">Save the product first, then you can add photos.</p>
          )}

          {saveError ? <p className="mt-5 text-xs text-[#b83a36]" data-testid="text-save-error">{saveError}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#b83a36] px-5 py-3.5 text-sm font-semibold uppercase tracking-[.12em] text-[#fdf8f1] disabled:opacity-60"
            data-testid="button-save-product"
          >
            {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'} <Check size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function ProductsTab() {
  const { data: products, isLoading } = useAdminListProducts();
  const [editingId, setEditingId] = useState<'new' | string | null>(null);
  const editingProduct = editingId && editingId !== 'new' ? (products?.find((p) => p.id === editingId) ?? null) : null;
  const queryClient = useQueryClient();
  const deleteProduct = useAdminDeleteProduct({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() }) },
  });

  return (
    <>
      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <div className="flex items-center justify-between">
          <h2 className="serif text-2xl text-[#67232d]">Products</h2>
          <button
            type="button"
            onClick={() => setEditingId('new')}
            className="flex items-center gap-2 rounded-full bg-[#67232d] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5]"
            data-testid="button-new-product"
          >
            <Plus size={15} /> New product
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {isLoading ? <p className="text-sm text-[#9a7564]">Loading…</p> : null}
          {products?.map((product) => {
            const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
            const thumb = product.images.find((i) => i.isPrimary) ?? product.images[0];
            return (
              <div key={product.id} className="flex items-center gap-4 rounded-[1.25rem] border border-[#decdb9] bg-white p-4" data-testid={`row-product-${product.slug}`}>
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#decdb9] bg-[#fdf8f1]">
                  {thumb ? <img src={thumb.url} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-[#9a7564]">No photo</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="product-name text-base text-[#67232d]">{product.name}</p>
                  <p className="text-xs text-[#9a7564]">{product.category} · {product.variants.length} weight{product.variants.length === 1 ? '' : 's'} {product.active ? '' : '· hidden'}</p>
                </div>
                <span className="mono text-sm text-[#67232d]">{defaultVariant ? formatPrice(defaultVariant.price) : '—'}</span>
                <button type="button" onClick={() => setEditingId(product.id)} className="rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold text-[#67232d] hover:border-[#c9a15a]" data-testid={`button-edit-${product.slug}`}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete ${product.name}?`)) deleteProduct.mutate({ id: product.id }); }}
                  className="grid size-9 place-items-center rounded-full text-[#b83a36] hover:bg-[#f1e5d8]"
                  data-testid={`button-delete-${product.slug}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {editingId ? <ProductEditor product={editingProduct} onClose={() => setEditingId(null)} /> : null}
    </>
  );
}

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-[#c9a15a]/20 text-[#8a5a2b]',
  confirmed: 'bg-[#3f8f5f]/15 text-[#2f6b46]',
  shipped: 'bg-[#67232d]/10 text-[#67232d]',
  delivered: 'bg-[#3f8f5f]/25 text-[#2f6b46]',
  cancelled: 'bg-[#b83a36]/15 text-[#b83a36]',
};

function OrderSummaryRow({ order, onOpen }: { order: OrderWithItems; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-[1.25rem] border border-[#decdb9] bg-white p-4 text-left transition-colors hover:border-[#c9a15a]"
      data-testid={`row-order-${order.orderNumber}`}
    >
      <div className="min-w-0 flex-1">
        <p className="product-name text-base text-[#67232d]">{order.orderNumber}{order.invoiceNumber ? <span className="mono ml-2 text-[10px] font-normal uppercase tracking-[.12em] text-[#9a7564]">Bill {order.invoiceNumber}</span> : null}</p>
        <p className="truncate text-xs text-[#9a7564]">{order.customerName} · {new Date(order.createdAt).toLocaleDateString('en-IN')} · {order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
      </div>
      {order.source === 'offline' ? (
        <span className="rounded-full bg-[#2f6b3f]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#2f6b3f]" data-testid={`badge-offline-${order.orderNumber}`}>Offline</span>
      ) : null}
      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${order.shippingMethod === 'shiprocket' ? 'bg-[#c9a15a]/20 text-[#8a5a2b]' : 'bg-[#67232d]/10 text-[#67232d]'}`}>
        {carrierLabel(order.shippingMethod)}
      </span>
      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] capitalize ${STATUS_STYLES[order.status] ?? 'bg-[#decdb9] text-[#67232d]'}`}>
        {order.status}
      </span>
      <span className="mono w-20 shrink-0 text-right text-sm text-[#67232d]">{formatPrice(order.total)}</span>
    </button>
  );
}

function OrderDetailModal({ order, onClose, onEdit }: { order: OrderWithItems; onClose: () => void; onEdit?: () => void }) {
  const queryClient = useQueryClient();
  const can = useCan();
  const canShip = can('orders.ship');
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '');
  const [shipError, setShipError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [shipment, setShipment] = useState({ shipmentId: order.shiprocketShipmentId ?? null, courier: order.courierName ?? null, pickup: order.pickupScheduledFor ?? null });
  const [pickupBusy, setPickupBusy] = useState(false);
  const [sendingTracking, setSendingTracking] = useState(false);
  const [copies, setCopies] = useState('1');
  const copiesParam = Math.min(Math.max(Math.round(Number(copies)) || 1, 1), 20);
  const [trackingResult, setTrackingResult] = useState<{ ok: boolean; message: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });

  const updateOrder = useAdminUpdateOrder({
    mutation: {
      onSuccess: () => {
        invalidate();
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      },
    },
  });

  const shipOrder = useAdminShipOrder({
    mutation: {
      onSuccess: (updated) => {
        setStatus(updated.status);
        setTrackingNumber(updated.trackingNumber ?? '');
        setTrackingUrl(updated.trackingUrl ?? '');
        setShipment({ shipmentId: updated.shiprocketShipmentId ?? null, courier: updated.courierName ?? null, pickup: updated.pickupScheduledFor ?? null });
        setShipError(null);
        invalidate();
      },
      onError: (err) => { setShipError(err instanceof Error ? err.message : 'Could not create the shipment.'); invalidate(); },
    },
  });

  const schedulePickup = async () => {
    setShipError(null);
    setPickupBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/schedule-pickup`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not schedule the pickup.');
      setShipment((current) => ({ ...current, pickup: data.pickupScheduledFor ?? 'Requested' }));
      invalidate();
    } catch (err) {
      setShipError(err instanceof Error ? err.message : 'Could not schedule the pickup.');
    } finally {
      setPickupBusy(false);
    }
  };

  const sendTrackingToCustomer = async () => {
    setTrackingResult(null);
    if (trackingNumber.trim().length < 5) {
      setTrackingResult({ ok: false, message: 'Enter the India Post tracking number first.' });
      return;
    }
    setSendingTracking(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ trackingNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not send the tracking details.');
      setStatus(data.order.status);
      setTrackingNumber(data.order.trackingNumber ?? '');
      setTrackingUrl(data.order.trackingUrl ?? '');
      invalidate();
      const channels = [data.notified.whatsapp ? 'WhatsApp' : null, data.notified.email ? 'email' : null].filter(Boolean).join(' and ');
      setTrackingResult({
        ok: true,
        message: channels
          ? `${data.resent ? 'Tracking re-sent' : 'Order marked shipped and tracking sent'} to ${order.customerName} by ${channels}.`
          : "Order marked shipped, but WhatsApp and email aren't set up, so nothing was sent.",
      });
    } catch (err) {
      setTrackingResult({ ok: false, message: err instanceof Error ? err.message : 'Could not send the tracking details.' });
    } finally {
      setSendingTracking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#3a161e]/45 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet-in flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fdf8f1] sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#decdb9] px-6 py-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Order</p>
            <h2 className="serif text-xl text-[#67232d]">{order.orderNumber}</h2>
            {order.invoiceNumber ? <p className="mono mt-0.5 text-[10px] uppercase tracking-[.14em] text-[#9a7564]" data-testid="text-invoice-number">Bill no. {order.invoiceNumber}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {onEdit ? (
              <button type="button" onClick={onEdit} className="rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#67232d] hover:border-[#c9a15a]" data-testid="button-edit-order">
                Edit order
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#67232d] hover:bg-[#efe1d2]" data-testid="button-close-order-detail">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-4">
            <div className="rounded-xl border border-[#decdb9] bg-white p-4" data-testid="card-customer-delivery">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Customer & delivery address</p>
              <p className="mt-2 text-sm font-semibold text-[#67232d]">{order.customerName}</p>
              {order.address.trim() ? (
                <p className="mt-1.5 flex items-start gap-1.5 whitespace-pre-line text-xs text-[#775e53]"><MapPin size={12} className="mt-0.5 shrink-0" /> <span>{[order.address, order.city, order.state].filter(Boolean).join(', ')} {order.pincode}</span></p>
              ) : (
                <p className="mt-1.5 text-xs text-[#9a7564]">No delivery address (collected in store)</p>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#775e53]"><Phone size={12} /> {order.phone || 'No mobile number'}</p>
            </div>
            {order.billingAddress ? (
              <div className="rounded-xl border border-[#decdb9] bg-white p-4 sm:col-span-2">
                <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Billing address</p>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[#775e53]"><MapPin size={12} className="mt-0.5 shrink-0" /> {order.billingAddress}, {order.billingCity}{order.billingState ? `, ${order.billingState}` : ''} {order.billingPincode}</p>
              </div>
            ) : null}
          </div>

          {order.notes ? (
            <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Delivery notes</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[#775e53]"><StickyNote size={12} className="mt-0.5 shrink-0" /> {order.notes}</p>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4" data-testid="card-order-info">
            <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Order details</p>
            <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
              <div><dt className="text-[#9a7564]">Placed on</dt><dd className="font-semibold text-[#67232d]" data-testid="text-order-placed-at">{new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</dd></div>
              <div><dt className="text-[#9a7564]">Bill no.</dt><dd className="font-semibold text-[#67232d]">{order.invoiceNumber ?? '—'}</dd></div>
              <div><dt className="text-[#9a7564]">Payment</dt><dd className="font-semibold text-[#67232d]">{order.paymentMethod} · <span className="capitalize">{order.paymentStatus}</span></dd></div>
              <div><dt className="text-[#9a7564]">Razorpay payment ID</dt><dd className="break-all font-semibold text-[#67232d]">{order.razorpayPaymentId ?? '—'}</dd></div>
              <div><dt className="text-[#9a7564]">Customer email</dt><dd className="break-all font-semibold text-[#67232d]">{order.email ?? '—'}</dd></div>
              <div><dt className="text-[#9a7564]">Delivery</dt><dd className="font-semibold text-[#67232d]">{order.shippingMethod === 'shiprocket' ? 'Fast delivery (Shiprocket)' : order.shippingMethod === 'india_post' ? 'Standard delivery (India Post)' : 'Collected in store'}</dd></div>
              <div><dt className="text-[#9a7564]">Order source</dt><dd className="font-semibold text-[#67232d]">{order.source === 'offline' ? 'Offline (added by hand)' : 'Website'}</dd></div>
            </dl>
          </div>

          <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4">
            <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Items</p>
            <div className="mt-3 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm text-[#67232d]">
                  <span>{item.name} × {item.quantity}</span>
                  <span className="mono">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 border-t border-[#decdb9] pt-3 text-xs text-[#775e53]">
              <div className="flex justify-between"><span>Subtotal</span><span className="mono">{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span className="mono">{order.shippingFee === 0 ? 'Free' : formatPrice(order.shippingFee)}</span></div>
              {(order.packagingFee ?? 0) > 0 ? <div className="flex justify-between"><span>Packaging</span><span className="mono">{formatPrice(order.packagingFee ?? 0)}</span></div> : null}
              <div className="flex justify-between text-sm font-semibold text-[#67232d]"><span>Total</span><span className="mono">{formatPrice(order.total)}</span></div>
            </div>
            <p className="mt-2 text-xs text-[#9a7564]">Paid via {order.paymentMethod}</p>
          </div>

          {canShip ? (
          <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Fulfillment</p>
              <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${order.shippingMethod === 'shiprocket' ? 'bg-[#c9a15a]/20 text-[#8a5a2b]' : 'bg-[#67232d]/10 text-[#67232d]'}`}>
                {carrierLabel(order.shippingMethod)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2 w-full rounded-lg border border-[#decdb9] bg-transparent px-3 py-2 text-sm capitalize outline-none" data-testid="select-order-status">
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {order.shippingMethod !== 'shiprocket' ? null : (
                <>
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Tracking number</span>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. EE123456789IN"
                  className="mt-2 w-full rounded-lg border border-[#decdb9] bg-transparent px-3 py-2 text-sm outline-none"
                  data-testid="input-order-tracking-number"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Tracking link (optional)</span>
                <input
                  type="text"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-2 w-full rounded-lg border border-[#decdb9] bg-transparent px-3 py-2 text-sm outline-none"
                  data-testid="input-order-tracking-url"
                />
              </label>
                </>
              )}
            </div>

            {order.shippingMethod === 'shiprocket' && shipment.shipmentId && trackingNumber ? (
              <div className="mt-3 rounded-lg bg-[#f8f1e8] px-4 py-3 text-xs text-[#67232d]" data-testid="card-awb">
                <p><span className="text-[#9a7564]">AWB number:</span> <span className="mono font-semibold" data-testid="text-awb">{trackingNumber}</span></p>
                {shipment.courier ? <p className="mt-1"><span className="text-[#9a7564]">Courier:</span> <span className="font-semibold">{shipment.courier}</span></p> : null}
                <p className="mt-1"><span className="text-[#9a7564]">Pickup:</span> <span className="font-semibold">{shipment.pickup ?? 'Not scheduled yet'}</span></p>
              </div>
            ) : null}

            {order.trackingUrl ? (
              <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#b83a36]">
                <ExternalLink size={12} /> Open current tracking link
              </a>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[#775e53]">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Copies to print</span>
                <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(e.target.value)} className="w-16 rounded-lg border border-[#decdb9] bg-white px-2 py-1.5 text-center text-sm outline-none" data-testid="input-print-copies" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateOrder.mutate({ id: order.id, data: { status, trackingNumber: trackingNumber || null, trackingUrl: trackingUrl || null } })}
                disabled={updateOrder.isPending}
                className="flex items-center gap-2 rounded-full bg-[#67232d] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60"
                data-testid="button-save-order"
              >
                {updateOrder.isPending ? 'Saving…' : saved ? 'Saved' : 'Save changes'} <Check size={14} />
              </button>

              {order.shippingMethod === 'shiprocket' ? (
                shipment.shipmentId && trackingNumber ? (
                  <>
                    <a
                      href={`/api/admin/orders/${order.id}/awb-label?copies=${copiesParam}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-full border border-[#c9a15a] bg-[#c9a15a]/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a2b]"
                      data-testid="link-download-awb"
                    >
                      Download AWB label <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={schedulePickup}
                      disabled={pickupBusy || Boolean(shipment.pickup)}
                      className="flex items-center gap-2 rounded-full border border-[#c9a15a] bg-[#c9a15a]/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a2b] disabled:opacity-60"
                      data-testid="button-schedule-pickup"
                    >
                      {pickupBusy ? 'Scheduling…' : shipment.pickup ? 'Pickup scheduled' : 'Schedule pickup'} <Send size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShipError(null); shipOrder.mutate({ id: order.id }); }}
                    disabled={shipOrder.isPending}
                    className="flex items-center gap-2 rounded-full border border-[#c9a15a] bg-[#c9a15a]/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a2b] disabled:opacity-60"
                    data-testid="button-create-shipment"
                  >
                    {shipOrder.isPending ? 'Creating shipment…' : shipment.shipmentId ? 'Generate AWB' : 'Create shipment via Shiprocket'} <Send size={14} />
                  </button>
                )
              ) : null}

              <a
                href={`/api/admin/orders/${order.id}/invoice?copies=${copiesParam}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-[#decdb9] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#67232d]"
                data-testid="link-download-invoice"
              >
                Download invoice <ExternalLink size={14} />
              </a>
            </div>
            {shipError ? <p className="mt-3 text-xs text-[#b83a36]" data-testid="text-ship-error">{shipError}</p> : null}
            {order.shippingMethod === 'india_post' ? (
              <div className="mt-4 rounded-xl border border-[#c9a15a]/50 bg-[#c9a15a]/10 p-4">
                <p className="text-xs leading-relaxed text-[#775e53]">India Post orders are booked manually. After dispatching the parcel, enter the tracking code and send it. The order is marked shipped and the customer gets the code with the India Post tracking page by WhatsApp{order.email ? ' and email' : ''}.</p>
                <label className="mt-3 block">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">India Post tracking code</span>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. EE123456789IN"
                    className="mt-2 w-full rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-sm uppercase outline-none"
                    data-testid="input-india-post-tracking-code"
                  />
                </label>
                <button
                  type="button"
                  onClick={sendTrackingToCustomer}
                  disabled={sendingTracking || order.status === 'cancelled'}
                  className="mt-3 flex items-center gap-2 rounded-full bg-[#b83a36] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#fdf8f1] disabled:opacity-60"
                  data-testid="button-send-tracking"
                >
                  {sendingTracking ? 'Sending…' : order.status === 'shipped' || order.status === 'delivered' ? 'Resend tracking to customer' : 'Send tracking to customer'} <Send size={14} />
                </button>
                {trackingResult ? (
                  <p className={`mt-3 text-xs ${trackingResult.ok ? 'text-[#2f6b3f]' : 'text-[#b83a36]'}`} data-testid="text-send-tracking-result">{trackingResult.message}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          ) : (
          <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4" data-testid="card-order-readonly">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Fulfillment</p>
              <span className="rounded-full bg-[#67232d]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#67232d]">{carrierLabel(order.shippingMethod)}</span>
            </div>
            <p className="mt-3 text-xs text-[#775e53]">Status: <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${STATUS_STYLES[order.status] ?? ''}`}>{order.status}</span></p>
            {order.trackingNumber ? <p className="mt-2 text-xs text-[#775e53]">Tracking: <span className="mono font-semibold text-[#67232d]">{order.trackingNumber}</span></p> : null}
            {can('orders.invoice') ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[#775e53]">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Copies to print</span>
                  <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(e.target.value)} className="w-16 rounded-lg border border-[#decdb9] bg-white px-2 py-1.5 text-center text-sm outline-none" />
                </label>
                <a href={`/api/admin/orders/${order.id}/invoice?copies=${copiesParam}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-[#decdb9] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#67232d]" data-testid="link-download-invoice">
                  Download invoice <ExternalLink size={14} />
                </a>
              </div>
            ) : null}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function exportOrdersToExcel(orders: OrderWithItems[]) {
  const rows = orders.map((order) => ({
    'Order #': order.orderNumber,
    'Bill no.': order.invoiceNumber ?? '',
    Date: new Date(order.createdAt).toLocaleDateString('en-IN'),
    Customer: order.customerName,
    Phone: order.phone,
    Email: order.email ?? '',
    Address: order.address,
    City: order.city,
    State: order.state ?? '',
    Pincode: order.pincode,
    'Billing address': order.billingAddress ?? '',
    'Billing city': order.billingCity ?? '',
    'Billing state': order.billingState ?? '',
    'Billing pincode': order.billingPincode ?? '',
    Items: order.items.map((item) => `${item.quantity}x ${item.name}`).join(', '),
    Subtotal: order.subtotal,
    Shipping: order.shippingFee,
    Packaging: order.packagingFee ?? 0,
    Total: order.total,
    'Shipping method': carrierLabel(order.shippingMethod),
    Source: order.source === 'offline' ? 'Offline' : 'Online',
    'Payment method': order.paymentMethod,
    'Payment status': order.paymentStatus,
    Status: order.status,
    'Tracking number': order.trackingNumber ?? '',
    Courier: order.courierName ?? '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `gayathri-coffee-orders-${date}.xlsx`);
}

// A short sheet for the dispatch desk: just who, which order and which tracking number.
function exportTrackingToExcel(orders: OrderWithItems[]) {
  const rows = orders.map((order) => ({
    'Order number': order.orderNumber,
    'Bill number': order.invoiceNumber ?? '',
    Name: order.customerName,
    'Tracking number': order.trackingNumber ?? '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tracking');
  XLSX.writeFile(workbook, `gayathri-coffee-tracking-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

type ChatSummary = {
  phone: string;
  name: string | null;
  lastMessage: string;
  lastAt: string;
  needsReply: boolean;
  needsHuman: boolean;
  windowOpen: boolean;
  windowEndsAt: string | null;
};

type ChatMessage = {
  id: string;
  direction: 'in' | 'out' | 'note';
  kind: 'customer' | 'bot' | 'team' | 'template' | 'handoff';
  body: string | null;
  templateName: string | null;
  status: string | null;
  at: string;
};

type ChatThread = {
  phone: string;
  name: string | null;
  windowOpen: boolean;
  windowEndsAt: string | null;
  orders: { orderNumber: string; status: string; total: number; createdAt: string }[];
  messages: ChatMessage[];
};

async function chatFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/whatsapp${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.');
  return data as T;
}

const prettyPhone = (phone: string) => (phone.length === 12 && phone.startsWith('91') ? `+91 ${phone.slice(2)}` : `+${phone}`);

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatLeft(msLeft: number): string {
  const totalMinutes = Math.max(0, Math.floor(msLeft / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Re-renders every 30s so the 24-hour countdown stays accurate while the tab is open.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function WindowBadge({ chat, now }: { chat: { windowOpen: boolean; windowEndsAt: string | null }; now: number }) {
  const msLeft = chat.windowEndsAt ? new Date(chat.windowEndsAt).getTime() - now : 0;
  if (!chat.windowOpen || msLeft <= 0) {
    return <span className="rounded-full bg-[#decdb9]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[#775e53]">Window closed</span>;
  }
  const urgent = msLeft < 2 * 60 * 60 * 1000;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] ${urgent ? 'bg-[#f6d9a8] text-[#8a5a2b]' : 'bg-[#d7ecd9] text-[#2f6b3f]'}`}>
      {formatLeft(msLeft)} left
    </span>
  );
}

function ChatThreadView({ phone, onBack }: { phone: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: thread, isLoading } = useQuery({
    queryKey: ['wa-thread', phone],
    queryFn: () => chatFetch<ChatThread>(`/conversations/${phone}`),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length, phone]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wa-thread', phone] });
    queryClient.invalidateQueries({ queryKey: ['wa-chats'] });
  };

  const send = useMutation({
    mutationFn: (message: string) => chatFetch(`/conversations/${phone}/reply`, { method: 'POST', body: JSON.stringify({ text: message }) }),
    onSuccess: () => { setText(''); setError(null); refresh(); },
    onError: (err) => { setError(err instanceof Error ? err.message : 'Could not send.'); refresh(); },
  });

  const followUp = useMutation({
    mutationFn: () => chatFetch(`/conversations/${phone}/follow-up`, { method: 'POST' }),
    onSuccess: () => { setError(null); setNotice('Follow-up sent. You can reply freely once the customer answers.'); refresh(); },
    onError: (err) => { setNotice(null); setError(err instanceof Error ? err.message : 'Could not send the follow-up.'); },
  });

  const msLeft = thread?.windowEndsAt ? new Date(thread.windowEndsAt).getTime() - now : 0;
  const windowOpen = Boolean(thread?.windowOpen) && msLeft > 0;
  const urgent = windowOpen && msLeft < 2 * 60 * 60 * 1000;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-thread">
      <div className="flex items-center gap-3 border-b border-[#decdb9] px-4 py-3">
        <button type="button" onClick={onBack} className="grid size-8 place-items-center rounded-full text-[#67232d] hover:bg-[#efe1d2] md:hidden" aria-label="Back to chats"><ArrowRight size={16} className="rotate-180" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#67232d]">{thread?.name ?? prettyPhone(phone)}</p>
          <p className="truncate text-xs text-[#9a7564]">{thread?.name ? prettyPhone(phone) : 'Not an existing customer'}</p>
        </div>
        {thread?.orders.length ? (
          <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            {thread.orders.slice(0, 3).map((order) => (
              <span key={order.orderNumber} className="rounded-full border border-[#decdb9] px-2.5 py-1 text-[10px] font-semibold text-[#67232d]" title={`${order.status} · ${formatPrice(order.total)}`}>
                #{order.orderNumber} · <span className="capitalize">{order.status}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {windowOpen ? (
        <div className={`border-b px-4 py-2.5 text-xs ${urgent ? 'border-[#f0c987] bg-[#fdf1d8] text-[#8a5a2b]' : 'border-[#cfe5d2] bg-[#eef7ef] text-[#2f6b3f]'}`} data-testid="notice-window-open">
          <strong>{formatLeft(msLeft)} left</strong> to reply freely (until {new Date(thread!.windowEndsAt!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}).
          {urgent ? ' Reply soon — after this, WhatsApp only allows an approved template message.' : ' WhatsApp allows free replies for 24 hours after the customer’s last message.'}
        </div>
      ) : thread ? (
        <div className="border-b border-[#efc3bd] bg-[#fbeceb] px-4 py-2.5 text-xs text-[#9b2f2a]" data-testid="notice-window-closed">
          <strong>The 24-hour reply window has closed.</strong> WhatsApp only allows an approved template message now. Send the follow-up below — once the customer replies, you can chat freely again.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f8f1e8] px-4 py-4">
        {isLoading ? <p className="text-sm text-[#9a7564]">Loading…</p> : null}
        {thread?.messages.map((message) => {
          if (message.kind === 'handoff') {
            return (
              <div key={message.id} className="flex justify-center">
                <p className="max-w-[88%] rounded-xl border border-[#efc3bd] bg-[#fbeceb] px-3 py-2 text-center text-[11px] text-[#9b2f2a]" data-testid="note-handoff">
                  <strong>Bot handed this chat to your team:</strong> {message.body}
                </p>
              </div>
            );
          }
          const mine = message.direction === 'out';
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? (message.kind === 'team' ? 'bg-[#67232d] text-[#f9e7c5]' : 'bg-[#e8dcc8] text-[#4a2a20]') : 'bg-white text-[#67232d]'}`}>
                {mine ? (
                  <p className={`mb-0.5 text-[9px] font-semibold uppercase tracking-[.12em] ${message.kind === 'team' ? 'text-[#c9a15a]' : 'text-[#9a7564]'}`}>
                    {message.kind === 'team' ? 'Team' : message.kind === 'bot' ? 'Auto-reply bot' : 'Template message'}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{message.body ?? (message.templateName ? `Template: ${message.templateName}` : '')}</p>
                <p className={`mt-1 text-right text-[10px] ${mine && message.kind === 'team' ? 'text-[#d8c2a0]' : 'text-[#9a7564]'}`}>
                  {new Date(message.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  {mine && message.status ? ` · ${message.status}` : ''}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#decdb9] bg-[#fdf8f1] p-3">
        {error ? <p className="mb-2 text-xs text-[#b83a36]" data-testid="text-chat-error">{error}</p> : null}
        {notice ? <p className="mb-2 text-xs text-[#2f6b3f]">{notice}</p> : null}
        {windowOpen ? (
          <form
            onSubmit={(event) => { event.preventDefault(); if (text.trim() && !send.isPending) send.mutate(text.trim()); }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (text.trim() && !send.isPending) send.mutate(text.trim()); } }}
              rows={2}
              maxLength={4000}
              placeholder="Type your reply… (Enter to send, Shift+Enter for a new line)"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#decdb9] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9a15a]"
              data-testid="input-chat-reply"
            />
            <button type="submit" disabled={!text.trim() || send.isPending} className="flex h-11 items-center gap-2 rounded-full bg-[#67232d] px-5 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-50" data-testid="button-chat-send">
              {send.isPending ? 'Sending…' : 'Send'} <Send size={14} />
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => { setError(null); setNotice(null); followUp.mutate(); }} disabled={followUp.isPending} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#67232d] px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#67232d] disabled:opacity-60" data-testid="button-chat-follow-up">
            {followUp.isPending ? 'Sending…' : 'Send follow-up template'} <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function WhatsAppTab() {
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: chats, isLoading } = useQuery({
    queryKey: ['wa-chats'],
    queryFn: () => chatFetch<ChatSummary[]>('/conversations'),
    refetchInterval: 10_000,
  });
  const waiting = chats?.filter((chat) => chat.needsReply || chat.needsHuman).length ?? 0;
  const sortedChats = chats ? [...chats].sort((a, b) => Number(b.needsHuman) - Number(a.needsHuman)) : chats;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="serif text-2xl text-[#67232d]">WhatsApp chats</h2>
        {waiting > 0 ? <span className="rounded-full bg-[#b83a36] px-3 py-1 text-xs font-semibold text-[#fdf8f1]" data-testid="badge-needs-reply">{waiting} waiting for a reply</span> : null}
      </div>
      <p className="mt-1 text-xs text-[#9a7564]">Customers who message your WhatsApp number appear here. Our auto-reply bot answers first; once you reply, it steps back for 30 minutes.</p>

      <div className="mt-5 grid h-[calc(100dvh-290px)] min-h-[460px] overflow-hidden rounded-2xl border border-[#decdb9] bg-white md:grid-cols-[320px_1fr]">
        <div className={`min-h-0 overflow-y-auto border-r border-[#decdb9] ${selected ? 'hidden md:block' : ''}`} data-testid="chat-list">
          {isLoading ? <p className="p-4 text-sm text-[#9a7564]">Loading…</p> : null}
          {chats?.length === 0 ? <p className="p-4 text-sm text-[#9a7564]">No customer messages yet.</p> : null}
          {sortedChats?.map((chat) => (
            <button
              key={chat.phone}
              type="button"
              onClick={() => setSelected(chat.phone)}
              className={`block w-full border-b border-[#efe6d8] px-4 py-3 text-left transition-colors hover:bg-[#fdf8f1] ${selected === chat.phone ? 'bg-[#f8f1e8]' : ''}`}
              data-testid={`chat-row-${chat.phone}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-[#67232d]">{chat.name ?? prettyPhone(chat.phone)}</p>
                <span className="shrink-0 text-[10px] text-[#9a7564]">{timeAgo(chat.lastAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[#775e53]">{chat.lastMessage || '—'}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {chat.needsHuman ? <span className="rounded-full bg-[#b83a36] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[#fdf8f1]" data-testid={`tag-needs-human-${chat.phone}`}>Bot needs you</span> : chat.needsReply ? <span className="rounded-full bg-[#b83a36] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[#fdf8f1]">Needs reply</span> : null}
                <WindowBadge chat={chat} now={now} />
              </div>
            </button>
          ))}
        </div>

        <div className={`min-h-0 ${selected ? '' : 'hidden md:flex md:items-center md:justify-center'}`}>
          {selected ? <ChatThreadView key={selected} phone={selected} onBack={() => setSelected(null)} /> : <p className="text-sm text-[#9a7564]">Select a chat to read and reply.</p>}
        </div>
      </div>
    </div>
  );
}

const OFFLINE_CHANNELS = ['Walk-in · Mysuru shop', 'Walk-in · Bengaluru branch', 'Phone call', 'WhatsApp', 'Other'];
const OFFLINE_PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Pay later'];

type DeliveryChoice = 'pickup' | 'india_post' | 'shiprocket';

const DELIVERY_CHOICES: { id: DeliveryChoice; label: string; hint: string }[] = [
  { id: 'pickup', label: 'Collected in store', hint: 'Handed over now — nothing to ship' },
  { id: 'india_post', label: 'Courier — India Post', hint: 'Add the tracking code later from the order' },
];

const carrierLabel = (method: string) => (method === 'shiprocket' ? 'Shiprocket' : method === 'india_post' ? 'India Post' : 'In-store');

function variantSizeLabel(category: string, grams: number): string {
  if (category === 'Decoction') return `${grams} ml`;
  return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
}

type ManualItemDraft = { key: number; choice: string; name: string; price: string; quantity: string; variantId: string | null; grind: string };

const MANUAL_GRIND_OPTIONS = ['Coarse (Filter)', 'Medium', 'Fine (Nice)', 'Roasted Beans'];

const emptyItem = (key: number): ManualItemDraft => ({ key, choice: '', name: '', price: '', quantity: '1', variantId: null, grind: '' });

// Splits "Offline order — <channel> — <notes>" (as saved by the server) back into its parts for editing.
function parseOfflineNotes(raw: string | null | undefined): { channel: string; notes: string } {
  let rest = (raw ?? '').replace(/^Offline order/, '').replace(/^ — /, '');
  const channel = OFFLINE_CHANNELS.find((c) => rest === c || rest.startsWith(`${c} — `));
  if (channel) rest = rest.slice(channel.length).replace(/^ — /, '');
  return { channel: channel ?? OFFLINE_CHANNELS[0]!, notes: channel ? rest : rest };
}

function ManualOrderModal({ onClose, onCreated, editing }: { onClose: () => void; onCreated: (order: OrderWithItems) => void; editing?: OrderWithItems }) {
  const queryClient = useQueryClient();
  const { data: products } = useAdminListProducts();
  const parsedNotes = parseOfflineNotes(editing?.notes);
  const originalDate = editing ? new Date(editing.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;

  const [customerName, setCustomerName] = useState(editing?.customerName ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [channel, setChannel] = useState(parsedNotes.channel);
  const [delivery, setDelivery] = useState<DeliveryChoice>((editing?.shippingMethod as DeliveryChoice | undefined) ?? 'pickup');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [state, setState] = useState(editing ? (editing.state ?? '') : 'Karnataka');
  const [pincode, setPincode] = useState(editing?.pincode ?? '');
  // "Bill to" - only used when the invoice should go to a different address than the delivery one.
  const [billDifferent, setBillDifferent] = useState(Boolean(editing?.billingAddress));
  const [billingAddress, setBillingAddress] = useState(editing?.billingAddress ?? '');
  const [billingCity, setBillingCity] = useState(editing?.billingCity ?? '');
  const [billingState, setBillingState] = useState(editing?.billingState ?? 'Karnataka');
  const [billingPincode, setBillingPincode] = useState(editing?.billingPincode ?? '');
  // Website orders keep their verified payment; only offline orders can change payment, status and date.
  const isOnline = Boolean(editing && editing.source !== 'offline');
  const [items, setItems] = useState<ManualItemDraft[]>(
    editing
      ? editing.items.map((item, index) => ({ key: index + 1, choice: 'custom', name: item.name, price: String(item.price), quantity: String(item.quantity), variantId: item.productVariantId ?? null, grind: '' }))
      : [emptyItem(1)],
  );
  const [shippingFee, setShippingFee] = useState(String(editing?.shippingFee ?? 0));
  const [packagingFee, setPackagingFee] = useState(String(editing?.packagingFee ?? 0));
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? 'Cash');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>(editing ? (editing.paymentStatus === 'paid' ? 'paid' : 'pending') : 'paid');
  const [status, setStatus] = useState(editing?.status ?? 'delivered');
  const [orderDate, setOrderDate] = useState(() => originalDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(parsedNotes.notes);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const deliveryChoices = editing?.shippingMethod === 'shiprocket'
    ? [...DELIVERY_CHOICES, { id: 'shiprocket' as const, label: 'Courier — Shiprocket', hint: 'Existing Shiprocket order' }]
    : DELIVERY_CHOICES;

  const catalog = (products ?? []).flatMap((product) =>
    [...product.variants]
      .sort((a, b) => a.weightGrams - b.weightGrams)
      .map((variant) => ({
        value: `${product.id}|${variant.id}`,
        label: `${product.name} — ${variantSizeLabel(product.category, variant.weightGrams)} (${formatPrice(variant.price)})`,
        name: `${product.name} · ${variantSizeLabel(product.category, variant.weightGrams)}`,
        price: variant.price,
        variantId: variant.id,
      })),
  );

  const num = (value: string) => Math.max(0, Math.round(Number(value) || 0));
  const subtotal = items.reduce((sum, item) => sum + num(item.price) * Math.max(1, num(item.quantity)), 0);
  const total = subtotal + num(shippingFee) + num(packagingFee);

  const setItem = (key: number, patch: Partial<ManualItemDraft>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const pickCatalogItem = (key: number, value: string) => {
    if (value === 'custom' || value === '') {
      setItem(key, { choice: value, variantId: null, ...(value === '' ? { name: '', price: '' } : {}) });
      return;
    }
    const entry = catalog.find((option) => option.value === value);
    if (entry) setItem(key, { choice: value, name: entry.name, price: String(entry.price), variantId: entry.variantId });
  };

  const changeDelivery = (next: DeliveryChoice) => {
    setDelivery(next);
    setStatus(next === 'pickup' ? 'delivered' : 'confirmed');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!customerName.trim()) { setError("Enter the customer's name."); return; }
    const filled = items.filter((item) => item.name.trim());
    if (filled.length === 0) { setError('Add at least one item.'); return; }
    if (delivery !== 'pickup' && (!address.trim() || !pincode.trim())) { setError('Add the delivery address and pincode for a courier order.'); return; }
    if (billDifferent && (!billingAddress.trim() || !billingPincode.trim())) { setError('Add the billing address and pincode, or untick "Bill to a different address".'); return; }
    if (notifyCustomer && !phone.trim() && !email.trim()) { setError('Add a mobile number or email to send the customer a confirmation.'); return; }

    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/orders/${editing.id}/manual` : '/api/admin/orders/manual', {
        method: editing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: delivery === 'pickup' ? address.trim() : address.trim(),
          city: city.trim(),
          state: state.trim() || null,
          pincode: pincode.trim(),
          billingAddress: billDifferent ? billingAddress.trim() : null,
          billingCity: billDifferent ? billingCity.trim() : null,
          billingState: billDifferent ? billingState.trim() || null : null,
          billingPincode: billDifferent ? billingPincode.trim() : null,
          items: filled.map((item) => ({ productVariantId: item.variantId, name: item.grind ? `${item.name.trim()} · ${item.grind}` : item.name.trim(), price: num(item.price), quantity: Math.max(1, num(item.quantity)) })),
          shippingMethod: delivery,
          shippingFee: num(shippingFee),
          packagingFee: num(packagingFee),
          paymentMethod,
          paymentStatus,
          status,
          notes: notes.trim() || null,
          channel,
          // When editing, leave the original timestamp alone unless the date was actually changed.
          orderDate: editing && orderDate === originalDate ? null : orderDate || null,
          notifyCustomer: editing ? false : notifyCustomer,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not save the order.');
      queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
      onCreated(data as OrderWithItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the order.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9a15a]';
  const label = 'mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#3a161e]/45 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" data-testid="modal-manual-order">
      <form onSubmit={submit} className="sheet-in flex max-h-[94vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fdf8f1] sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#decdb9] px-6 py-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">{editing ? `${isOnline ? 'Website' : 'Offline'} order ${editing.orderNumber}` : 'Offline order'}</p>
            <h2 className="serif text-xl text-[#67232d]">{editing ? 'Edit order' : 'Add an order by hand'}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#67232d] hover:bg-[#efe1d2]" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-xl border border-[#decdb9] bg-white p-4">
            <p className={label}>Customer</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs text-[#775e53]">Name *</span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={field} data-testid="input-manual-name" /></label>
              <label className="block"><span className="text-xs text-[#775e53]">Mobile number</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="10-digit number" className={field} data-testid="input-manual-phone" /></label>
              <label className="block"><span className="text-xs text-[#775e53]">Email (optional)</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={field} /></label>
              {isOnline ? null : <label className="block"><span className="text-xs text-[#775e53]">Where did this order come from?</span>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={field}>{OFFLINE_CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>}
            </div>
          </section>

          <section className="rounded-xl border border-[#decdb9] bg-white p-4">
            <p className={label}>{isOnline ? 'Delivery address' : 'Delivery'}</p>
            <div className={`mt-2 grid gap-2 sm:grid-cols-2 ${isOnline ? 'hidden' : ''}`}>
              {deliveryChoices.map((choice) => (
                <button key={choice.id} type="button" onClick={() => changeDelivery(choice.id)} className={`rounded-xl border px-3 py-3 text-left transition-colors ${delivery === choice.id ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`} data-testid={`button-manual-delivery-${choice.id}`}>
                  <span className="block text-xs font-semibold">{choice.label}</span>
                  <span className={`mt-0.5 block text-[10px] ${delivery === choice.id ? 'text-[#d9bfa9]' : 'text-[#9a7564]'}`}>{choice.hint}</span>
                </button>
              ))}
            </div>
            {delivery !== 'pickup' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className="text-xs text-[#775e53]">Delivery address *</span><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={field} data-testid="input-manual-address" /></label>
                <label className="block"><span className="text-xs text-[#775e53]">City</span><input value={city} onChange={(e) => setCity(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs text-[#775e53]">State</span><input value={state} onChange={(e) => setState(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs text-[#775e53]">Pincode *</span><input value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" maxLength={6} className={field} /></label>
              </div>
            ) : null}
            <label className="mt-4 flex items-start gap-2 text-xs text-[#775e53]">
              <input type="checkbox" checked={billDifferent} onChange={(e) => setBillDifferent(e.target.checked)} className="mt-0.5" data-testid="checkbox-manual-bill-different" />
              <span>Bill to a different address <span className="text-[#9a7564]">(the invoice shows this as “Bill to”, and the delivery address above as “Ship to”)</span></span>
            </label>
            {billDifferent ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="section-manual-billing">
                <label className="block sm:col-span-2"><span className="text-xs text-[#775e53]">Billing address *</span><textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} className={field} data-testid="input-manual-billing-address" /></label>
                <label className="block"><span className="text-xs text-[#775e53]">City</span><input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs text-[#775e53]">State</span><input value={billingState} onChange={(e) => setBillingState(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs text-[#775e53]">Pincode *</span><input value={billingPincode} onChange={(e) => setBillingPincode(e.target.value)} inputMode="numeric" maxLength={6} className={field} /></label>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-[#decdb9] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className={label}>Items</p>
              <button type="button" onClick={() => setItems((current) => [...current, emptyItem(Math.max(...current.map((i) => i.key)) + 1)])} className="flex items-center gap-1 text-xs font-semibold text-[#b83a36]" data-testid="button-manual-add-item"><Plus size={14} /> Add item</button>
            </div>
            <div className="mt-3 space-y-3">
              {items.map((item) => (
                <div key={item.key} className="grid grid-cols-[1fr_84px_70px_auto] items-end gap-2 rounded-lg border border-[#efe6d8] p-2.5">
                  <div className="col-span-4 sm:col-span-1">
                    <select value={item.choice} onChange={(e) => pickCatalogItem(item.key, e.target.value)} className="w-full rounded-lg border border-[#decdb9] bg-white px-2 py-2 text-xs outline-none" data-testid="select-manual-item">
                      <option value="">Choose a product…</option>
                      {catalog.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      <option value="custom">Custom item (type a name)</option>
                    </select>
                    {item.choice === 'custom' || item.choice === '' ? (
                      <input value={item.name} onChange={(e) => setItem(item.key, { name: e.target.value })} placeholder="Item name" className="mt-1.5 w-full rounded-lg border border-[#decdb9] bg-white px-2 py-2 text-xs outline-none" />
                    ) : null}
                    <select value={item.grind} onChange={(e) => setItem(item.key, { grind: e.target.value })} className="mt-1.5 w-full rounded-lg border border-[#decdb9] bg-white px-2 py-2 text-xs outline-none" data-testid="select-manual-grind">
                      <option value="">Grind: not specified</option>
                      {MANUAL_GRIND_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <label className="block"><span className="text-[9px] uppercase text-[#9a7564]">Price ₹</span><input value={item.price} onChange={(e) => setItem(item.key, { price: e.target.value })} inputMode="numeric" className="w-full rounded-lg border border-[#decdb9] bg-white px-2 py-2 text-xs outline-none" data-testid="input-manual-price" /></label>
                  <label className="block"><span className="text-[9px] uppercase text-[#9a7564]">Qty</span><input value={item.quantity} onChange={(e) => setItem(item.key, { quantity: e.target.value })} inputMode="numeric" className="w-full rounded-lg border border-[#decdb9] bg-white px-2 py-2 text-xs outline-none" /></label>
                  <button type="button" onClick={() => setItems((current) => (current.length > 1 ? current.filter((i) => i.key !== item.key) : current))} disabled={items.length === 1} className="grid size-8 place-items-center rounded-full text-[#b83a36] disabled:opacity-30" aria-label="Remove item"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs text-[#775e53]">Delivery charge ₹</span><input value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} inputMode="numeric" className={field} /></label>
              <label className="block"><span className="text-xs text-[#775e53]">Packaging charge ₹</span><input value={packagingFee} onChange={(e) => setPackagingFee(e.target.value)} inputMode="numeric" className={field} /></label>
            </div>
            <div className="mt-4 space-y-1 border-t border-[#efe6d8] pt-3 text-xs text-[#775e53]">
              <div className="flex justify-between"><span>Items subtotal</span><span className="mono">{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between text-sm font-semibold text-[#67232d]"><span>Order total</span><span className="mono" data-testid="text-manual-total">{formatPrice(total)}</span></div>
            </div>
          </section>

          <section className="rounded-xl border border-[#decdb9] bg-white p-4">
            <p className={label}>{isOnline ? 'Notes' : 'Payment & status'}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {isOnline ? null : <><label className="block"><span className="text-xs text-[#775e53]">Paid by</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={field}>{OFFLINE_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="block"><span className="text-xs text-[#775e53]">Payment</span><select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')} className={field}><option value="paid">Paid</option><option value="pending">Pending</option></select></label>
              <label className="block"><span className="text-xs text-[#775e53]">Order status</span><select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} capitalize`}>{['pending', 'confirmed', 'shipped', 'delivered'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="block"><span className="text-xs text-[#775e53]">Order date</span><input type="date" value={orderDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOrderDate(e.target.value)} className={field} /></label></>}
              <label className="block sm:col-span-2"><span className="text-xs text-[#775e53]">{isOnline ? 'Delivery notes (optional)' : 'Notes (optional)'}</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} /></label>
            </div>
            {editing ? null : <label className="mt-3 flex items-start gap-2 text-xs text-[#775e53]">
              <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} className="mt-0.5" data-testid="checkbox-manual-notify" />
              <span>Send the customer an order confirmation on WhatsApp{email.trim() ? ' and email' : ''} <span className="text-[#9a7564]">(off by default — they are usually with you already)</span></span>
            </label>}
          </section>
        </div>

        <div className="border-t border-[#decdb9] bg-[#f1e5d8] px-6 py-4">
          {error ? <p className="mb-2 text-xs text-[#b83a36]" data-testid="text-manual-error">{error}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[#775e53]">{editing ? 'Keeps the same order and bill number; the invoice reflects your changes.' : 'Gets the next order and bill number, and an invoice like any other order.'}</p>
            <button type="submit" disabled={saving} className="flex shrink-0 items-center gap-2 rounded-full bg-[#67232d] px-6 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60" data-testid="button-manual-save">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save order'} <Check size={14} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

type OrderFilter = 'all' | 'shiprocket' | 'india_post' | 'offline';

const ORDER_FILTER_TABS: { id: OrderFilter; label: string }[] = [
  { id: 'all', label: 'All orders' },
  { id: 'shiprocket', label: 'Shiprocket' },
  { id: 'india_post', label: 'India Post' },
  { id: 'offline', label: 'Offline orders' },
];

type ReconcileUnmatched = { paymentId: string; razorpayOrderId: string | null; amount: number; contact: string | null; email: string | null; paidAt: string };

// Orders added by hand can always be edited; website orders until they ship (or are cancelled).
const canEditOrder = (order: OrderWithItems) =>
  order.source === 'offline' || (['pending', 'confirmed'].includes(order.status) && !order.trackingNumber && !order.shiprocketShipmentId);

// An order still needs dispatching if it isn't finished or cancelled and has no tracking number yet.
const needsDispatch = (order: OrderWithItems) => !['shipped', 'delivered', 'cancelled'].includes(order.status) && !order.trackingNumber;

function OrdersTab() {
  // Shiprocket/Razorpay webhooks update orders server-side outside of any
  // click here, so poll instead of relying solely on manual invalidation.
  const { data: orders, isLoading } = useAdminListOrders({
    query: { queryKey: getAdminListOrdersQueryKey(), refetchInterval: 15_000 },
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithItems | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reconcile, setReconcile] = useState<{ busy: boolean; message: string | null; unmatched: ReconcileUnmatched[] }>({ busy: false, message: null, unmatched: [] });
  const queryClient = useQueryClient();
  const can = useCan();

  // Checks Razorpay for any payment that never became an order, and creates it. Runs when the tab
  // opens (quietly) and whenever the button is pressed.
  const checkPayments = async (quiet: boolean) => {
    setReconcile((current) => ({ ...current, busy: true, message: quiet ? current.message : null }));
    try {
      const res = await fetch('/api/admin/orders/reconcile-payments', { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not check Razorpay payments.');
      if (data.created.length > 0) queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
      setReconcile({
        busy: false,
        unmatched: data.unmatched ?? [],
        message: data.created.length > 0
          ? `Recovered ${data.created.length} paid order${data.created.length === 1 ? '' : 's'}: ${data.created.join(', ')}.`
          : quiet ? null : `All ${data.checked} recent Razorpay payments already have an order.`,
      });
    } catch (err) {
      setReconcile({ busy: false, unmatched: [], message: quiet ? null : err instanceof Error ? err.message : 'Could not check Razorpay payments.' });
    }
  };
  useEffect(() => { if (can('payments')) void checkPayments(true); }, []);
  const selectedOrder = selectedId ? (orders?.find((o) => o.id === selectedId) ?? null) : null;

  const inTab = (order: OrderWithItems, tab: OrderFilter) => tab === 'all' || (tab === 'offline' ? order.source === 'offline' : order.shippingMethod === tab);
  const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const query = search.trim().toLowerCase();
  const matchesSearch = (order: OrderWithItems) =>
    !query ||
    [order.orderNumber, order.invoiceNumber, order.customerName, order.phone, order.email, order.trackingNumber, order.city, order.pincode, ...order.items.map((item) => item.name)]
      .some((value) => value?.toLowerCase().includes(query));
  const visibleOrders = orders?.filter(
    (order) =>
      inTab(order, filter) &&
      matchesSearch(order) &&
      (statusFilter === 'all' || order.status === statusFilter) &&
      (paymentFilter === 'all' || order.paymentStatus === paymentFilter) &&
      (!fromDate || istDay(order.createdAt) >= fromDate) &&
      (!toDate || istDay(order.createdAt) <= toDate),
  );
  const cancelledCount = orders?.filter((order) => order.status === 'cancelled').length ?? 0;
  const anyFilter = Boolean(query || statusFilter !== 'all' || paymentFilter !== 'all' || fromDate || toDate);
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setPaymentFilter('all'); setFromDate(''); setToDate(''); };
  const filterLabel = ORDER_FILTER_TABS.find((tab) => tab.id === filter)?.label ?? 'Orders';

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h2 className="serif text-2xl text-[#67232d]">Orders</h2>
        <div className="flex flex-wrap items-center gap-2">
        {can('orders.edit') ? <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-full bg-[#67232d] px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#f9e7c5]"
          data-testid="button-add-offline-order"
        >
          <Plus size={14} /> Add offline order
        </button> : null}
        {can('export') ? <button
          type="button"
          onClick={() => visibleOrders?.length && exportOrdersToExcel(visibleOrders)}
          disabled={!visibleOrders?.length}
          className="flex items-center gap-2 rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#67232d] disabled:opacity-60"
          data-testid="button-export-orders-excel"
        >
          Export {visibleOrders?.length ?? 0} {anyFilter || filter !== 'all' ? 'filtered ' : ''}to Excel <ExternalLink size={14} />
        </button> : null}
        {can('export', 'orders.ship') ? <button
          type="button"
          onClick={() => visibleOrders?.length && exportTrackingToExcel(visibleOrders)}
          disabled={!visibleOrders?.length}
          className="flex items-center gap-2 rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#67232d] disabled:opacity-60"
          data-testid="button-export-tracking-excel"
        >
          Tracking sheet <ExternalLink size={14} />
        </button> : null}
        {can('payments') ? <button
          type="button"
          onClick={() => void checkPayments(false)}
          disabled={reconcile.busy}
          className="flex items-center gap-2 rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#67232d] disabled:opacity-60"
          data-testid="button-check-payments"
        >
          {reconcile.busy ? 'Checking…' : 'Check payments'} <Check size={14} />
        </button> : null}
        </div>
      </div>
      {reconcile.message ? <p className="mt-3 rounded-lg bg-[#3f8f5f]/10 px-4 py-2 text-xs text-[#2f6b46]" data-testid="text-reconcile-message">{reconcile.message}</p> : null}
      {reconcile.unmatched.length > 0 ? (
        <div className="mt-3 rounded-lg border border-[#b83a36]/40 bg-[#b83a36]/10 px-4 py-3 text-xs text-[#67232d]" data-testid="card-unmatched-payments">
          <p className="font-semibold text-[#b83a36]">{reconcile.unmatched.length} payment{reconcile.unmatched.length === 1 ? '' : 's'} received in Razorpay with no order details saved — add {reconcile.unmatched.length === 1 ? 'it' : 'them'} with “Add offline order”:</p>
          <ul className="mt-2 space-y-1">
            {reconcile.unmatched.map((payment) => (
              <li key={payment.paymentId} className="mono">{payment.paymentId} · ₹{payment.amount} · {payment.contact ?? '—'} · {payment.email ?? '—'} · {new Date(payment.paidAt).toLocaleString('en-IN')}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2 overflow-x-auto" role="tablist" aria-label="Order carrier">
        {ORDER_FILTER_TABS.map((tab) => {
          const count = orders?.filter((order) => inTab(order, tab.id)).length ?? 0;
          const pending = orders?.filter((order) => inTab(order, tab.id) && needsDispatch(order)).length ?? 0;
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[.1em] transition-colors ${active ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
              data-testid={`tab-orders-${tab.id}`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-[#f9e7c5]/20' : 'bg-[#67232d]/10'}`}>{count}</span>
              {pending > 0 ? (
                <span className="rounded-full bg-[#b83a36] px-2 py-0.5 text-[10px] text-[#fdf8f1]" title="Orders waiting to be dispatched">{pending} to dispatch</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]" data-testid="bar-order-filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no., bill no., name, phone, tracking, item…"
          className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs outline-none focus:border-[#c9a15a] sm:col-span-2 lg:col-span-1"
          data-testid="input-order-search"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs capitalize outline-none" aria-label="Order status" data-testid="select-filter-status">
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}{status === 'cancelled' ? ` (${cancelledCount})` : ''}</option>)}
        </select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs outline-none" aria-label="Payment status" data-testid="select-filter-payment">
          <option value="all">Any payment</option>
          <option value="paid">Paid</option>
          <option value="pending">Payment pending</option>
          <option value="failed">Payment failed</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partly refunded</option>
        </select>
        <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs outline-none" aria-label="From date" data-testid="input-filter-from" />
        <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs outline-none" aria-label="To date" data-testid="input-filter-to" />
        <button type="button" onClick={clearFilters} disabled={!anyFilter} className="rounded-lg border border-[#decdb9] px-3 py-2 text-xs font-semibold text-[#67232d] disabled:opacity-40" data-testid="button-clear-filters">Clear</button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? <p className="text-sm text-[#9a7564]">Loading…</p> : null}
        {visibleOrders?.length === 0 ? <p className="text-sm text-[#9a7564]">{anyFilter ? 'No orders match these filters.' : filter === 'all' ? 'No orders yet.' : `No ${filterLabel} orders yet.`}</p> : null}
        {visibleOrders?.map((order) => <OrderSummaryRow key={order.id} order={order} onOpen={() => setSelectedId(order.id)} />)}
      </div>
      {selectedOrder && !editingOrder ? (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedId(null)} onEdit={can('orders.edit') && canEditOrder(selectedOrder) ? () => setEditingOrder(selectedOrder) : undefined} />
      ) : null}
      {adding ? (
        <ManualOrderModal
          onClose={() => setAdding(false)}
          onCreated={(order) => { setAdding(false); setFilter('offline'); setSelectedId(order.id); }}
        />
      ) : null}
      {editingOrder ? (
        <ManualOrderModal
          editing={editingOrder}
          onClose={() => setEditingOrder(null)}
          onCreated={(order) => { setEditingOrder(null); setSelectedId(order.id); }}
        />
      ) : null}
    </div>
  );
}

type RateTierDraft = { weightGrams: number; price: number };

function SettingsTab() {
  const can = useCan();
  const { data: settings, isLoading } = useAdminGetSettings();
  const queryClient = useQueryClient();
  const [rateTable, setRateTable] = useState<RateTierDraft[]>([]);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(0);
  const [saved, setSaved] = useState(false);
  const [packerName, setPackerName] = useState('');
  const [packerPhone, setPackerPhone] = useState('');

  const { data: packingRecipients, isLoading: packingRecipientsLoading } = useAdminListPackingRecipients();
  const addPackingRecipient = useAdminCreatePackingRecipient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListPackingRecipientsQueryKey() });
        setPackerName('');
        setPackerPhone('');
      },
    },
  });
  const removePackingRecipient = useAdminDeletePackingRecipient({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListPackingRecipientsQueryKey() }),
    },
  });

  const handleAddPacker = () => {
    if (!packerName.trim() || !packerPhone.trim()) return;
    addPackingRecipient.mutate({ data: { name: packerName.trim(), phone: packerPhone.trim() } });
  };

  useEffect(() => {
    if (settings) {
      setRateTable(settings.indiaPostRateTable.slice().sort((a, b) => a.weightGrams - b.weightGrams));
      setFreeDeliveryThreshold(settings.freeDeliveryThreshold);
    }
  }, [settings]);

  const updateSettings = useAdminUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      },
    },
  });

  const setTier = (index: number, patch: Partial<RateTierDraft>) =>
    setRateTable((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  const addTier = () =>
    setRateTable((current) => {
      const last = current[current.length - 1];
      return [...current, { weightGrams: (last?.weightGrams ?? 0) + 500, price: (last?.price ?? 0) + 20 }];
    });

  const removeTier = (index: number) => setRateTable((current) => current.filter((_, i) => i !== index));

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        indiaPostRateTable: rateTable.slice().sort((a, b) => a.weightGrams - b.weightGrams),
        freeDeliveryThreshold,
      },
    });
  };

  if (isLoading) {
    return <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8"><p className="text-sm text-[#9a7564]">Loading…</p></div>;
  }

  return (
    <div className="mx-auto max-w-[700px] px-5 py-10 sm:px-8">
      {can('settings') ? <>
      <h2 className="serif text-2xl text-[#67232d]">Shipping settings</h2>

      <div className="mt-6 rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Free delivery threshold (₹)</span>
          <input type="number" min={0} value={freeDeliveryThreshold} onChange={(e) => setFreeDeliveryThreshold(Number(e.target.value))} className="mt-2 w-full max-w-[220px] border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-free-delivery-threshold" />
        </label>
        <p className="mt-2 text-xs text-[#9a7564]">Orders at or above this subtotal ship free, on either method. Shiprocket's per-order fee below this is a flat estimate; India Post uses the rate card below.</p>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">India Post rate card</p>
          <button type="button" onClick={addTier} className="flex items-center gap-1 text-xs font-semibold text-[#b83a36]" data-testid="button-add-rate-tier">
            <Plus size={14} /> Add row
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-x-3 gap-y-2 text-[10px] uppercase tracking-[.1em] text-[#9a7564]">
          <span className="mono">Gram</span>
          <span className="mono">Parcel (₹)</span>
          <span />
        </div>
        <div className="mt-1 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {rateTable.map((tier, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 rounded-lg border border-[#decdb9] bg-[#fdf8f1] px-3 py-2">
              <input
                type="number"
                min={1}
                value={tier.weightGrams}
                onChange={(e) => setTier(index, { weightGrams: Number(e.target.value) })}
                className="w-full bg-transparent text-sm outline-none"
                data-testid={`input-rate-tier-grams-${index}`}
              />
              <input
                type="number"
                min={0}
                value={tier.price}
                onChange={(e) => setTier(index, { price: Number(e.target.value) })}
                className="w-full bg-transparent text-sm outline-none"
                data-testid={`input-rate-tier-price-${index}`}
              />
              <button type="button" onClick={() => removeTier(index)} className="grid size-7 place-items-center rounded-full text-[#b83a36] hover:bg-[#f1e5d8]" data-testid={`button-remove-rate-tier-${index}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {rateTable.length === 0 ? <p className="py-4 text-center text-xs text-[#9a7564]">No rows yet — add one above.</p> : null}
        </div>

        <p className="mt-4 text-xs text-[#9a7564]">A parcel is charged for the lightest row that can still hold its total weight — e.g. a 1.2&nbsp;kg order is charged the 1500&nbsp;g rate. Orders heavier than the last row use that row's price.</p>

        <button
          type="button"
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className="mt-6 flex items-center gap-2 rounded-full bg-[#b83a36] px-5 py-3 text-sm font-semibold uppercase tracking-[.12em] text-[#fdf8f1] disabled:opacity-60"
          data-testid="button-save-settings"
        >
          {updateSettings.isPending ? 'Saving…' : saved ? 'Saved' : 'Save settings'} <Check size={16} />
        </button>
      </div>
      </> : null}

      {can('packing') ? <div className="mt-6 rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
        <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Packing team WhatsApp alerts</p>
        <p className="mt-2 text-xs text-[#9a7564]">Everyone added here gets a WhatsApp message with the order number and items whenever a new order comes in — just what's needed to pack it, nothing else.</p>

        <div className="mt-4 space-y-2">
          {packingRecipientsLoading ? <p className="text-xs text-[#9a7564]">Loading…</p> : null}
          {packingRecipients?.map((recipient) => (
            <div key={recipient.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#decdb9] bg-[#fdf8f1] px-3 py-2">
              <div>
                <p className="text-sm text-[#67232d]">{recipient.name}</p>
                <p className="mono text-xs text-[#9a7564]">{recipient.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => removePackingRecipient.mutate({ id: recipient.id })}
                className="grid size-7 shrink-0 place-items-center rounded-full text-[#b83a36] hover:bg-[#f1e5d8]"
                data-testid={`button-remove-packing-recipient-${recipient.id}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!packingRecipientsLoading && packingRecipients?.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#9a7564]">No one added yet.</p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Name</span>
            <input type="text" value={packerName} onChange={(e) => setPackerName(e.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-packer-name" />
          </label>
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">WhatsApp number</span>
            <input type="text" value={packerPhone} onChange={(e) => setPackerPhone(e.target.value)} placeholder="9XXXXXXXXX" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm outline-none" data-testid="input-packer-phone" />
          </label>
          <button
            type="button"
            onClick={handleAddPacker}
            disabled={addPackingRecipient.isPending}
            className="flex items-center gap-1 rounded-full bg-[#b83a36] px-4 py-2.5 text-xs font-semibold uppercase tracking-[.1em] text-[#fdf8f1] disabled:opacity-60"
            data-testid="button-add-packing-recipient"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div> : null}
    </div>
  );
}

const CHART_COLORS = ['#67232d', '#b83a36', '#c9a15a', '#8a5a2b', '#3f8f5f', '#775e53', '#d9b370'];

type DatePreset = 'today' | '7d' | 'this-month' | 'last-month' | '3m' | '12m' | 'all' | 'custom';
type Granularity = 'day' | 'week' | 'month';

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: '3m', label: 'Last 3 months' },
  { id: '12m', label: 'Last 12 months' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeRange(preset: DatePreset, customFrom: string, customTo: string): { from?: string; to?: string; granularity: Granularity } {
  const now = new Date();
  if (preset === 'today') return { from: toISODate(now), to: toISODate(now), granularity: 'day' };
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: toISODate(from), to: toISODate(now), granularity: 'day' };
  }
  if (preset === 'this-month') {
    return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now), granularity: 'day' };
  }
  if (preset === 'last-month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
    return { from: toISODate(lastMonth), to: toISODate(lastDay), granularity: 'day' };
  }
  if (preset === '3m') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { from: toISODate(from), to: toISODate(now), granularity: 'week' };
  }
  if (preset === '12m') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 12);
    return { from: toISODate(from), to: toISODate(now), granularity: 'month' };
  }
  if (preset === 'custom') return { from: customFrom || undefined, to: customTo || undefined, granularity: 'day' };
  return { granularity: 'month' };
}

function KpiCard({ label, value, deltaPct, format }: { label: string; value: number; deltaPct: number | null; format: (v: number) => string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#decdb9] bg-white p-5">
      <p className="mono text-[10px] uppercase tracking-[.16em] text-[#9a7564]">{label}</p>
      <p className="serif mt-2 text-2xl text-[#67232d]">{format(value)}</p>
      {deltaPct === null ? (
        <p className="mt-1 text-xs text-[#9a7564]">No prior period to compare</p>
      ) : (
        <p className={`mt-1 text-xs font-semibold ${deltaPct >= 0 ? 'text-[#3f8f5f]' : 'text-[#b83a36]'}`}>
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct.toFixed(1)}% vs previous period
        </p>
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6">
      <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function AnalyticsTab() {
  const [preset, setPreset] = useState<DatePreset>('this-month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [productMetric, setProductMetric] = useState<'revenue' | 'unitsSold'>('revenue');

  const range = computeRange(preset, customFrom, customTo);

  useEffect(() => {
    setGranularity(range.granularity);
    // Only re-derive the default granularity when the preset changes — the user can still override it manually afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const statsParams = { from: range.from, to: range.to, granularity };
  const queryEnabled = preset !== 'custom' || Boolean(customFrom && customTo);
  const { data: stats, isLoading } = useAdminGetStats(statsParams, {
    query: { enabled: queryEnabled, queryKey: getAdminGetStatsQueryKey(statsParams) },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="serif text-2xl text-[#67232d]">Analytics</h2>
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${preset === p.id ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
              data-testid={`button-analytics-preset-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' ? (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="mt-1 block border-b border-[#decdb9] bg-transparent py-1 text-sm text-[#67232d] outline-none"
              data-testid="input-analytics-from"
            />
          </label>
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="mt-1 block border-b border-[#decdb9] bg-transparent py-1 text-sm text-[#67232d] outline-none"
              data-testid="input-analytics-to"
            />
          </label>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Group by</span>
        {(['day', 'week', 'month'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition-colors ${granularity === g ? 'border-[#b83a36] bg-[#b83a36] text-[#fdf8f1]' : 'border-[#decdb9] text-[#775e53]'}`}
            data-testid={`button-analytics-granularity-${g}`}
          >
            {g}
          </button>
        ))}
      </div>

      {isLoading || !stats ? (
        <p className="mt-8 text-sm text-[#9a7564]">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Orders" value={stats.kpis.totalOrders.value} deltaPct={stats.kpis.totalOrders.deltaPct} format={(v) => v.toLocaleString('en-IN')} />
            <KpiCard label="Revenue" value={stats.kpis.totalRevenue.value} deltaPct={stats.kpis.totalRevenue.deltaPct} format={formatPrice} />
            <KpiCard label="Avg order value" value={stats.kpis.avgOrderValue.value} deltaPct={stats.kpis.avgOrderValue.deltaPct} format={formatPrice} />
            <KpiCard label="Units sold" value={stats.kpis.totalUnitsSold.value} deltaPct={stats.kpis.totalUnitsSold.deltaPct} format={(v) => v.toLocaleString('en-IN')} />
          </div>

          <SectionCard title="Orders & revenue over time">
            {stats.timeSeries.length === 0 ? (
              <p className="text-sm text-[#9a7564]">No orders in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={stats.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#decdb9" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#775e53' }} />
                  <YAxis yAxisId="orders" tick={{ fontSize: 11, fill: '#775e53' }} allowDecimals={false} />
                  <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11, fill: '#775e53' }} tickFormatter={(v) => formatPrice(v)} />
                  <Tooltip formatter={(value: number, name: string) => (name === 'revenue' ? formatPrice(value) : value)} />
                  <Legend />
                  <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#c9a15a" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="#67232d" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Top products">
              <div className="mb-3 flex gap-2">
                {(['revenue', 'unitsSold'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setProductMetric(m)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${productMetric === m ? 'border-[#b83a36] bg-[#b83a36] text-[#fdf8f1]' : 'border-[#decdb9] text-[#775e53]'}`}
                  >
                    {m === 'revenue' ? 'By revenue' : 'By units sold'}
                  </button>
                ))}
              </div>
              {stats.topProducts.length === 0 ? (
                <p className="text-sm text-[#9a7564]">No product sales in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, stats.topProducts.length * 34)}>
                  <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#decdb9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#775e53' }} tickFormatter={(v) => (productMetric === 'revenue' ? formatPrice(v) : String(v))} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#775e53' }} />
                    <Tooltip formatter={(value: number) => (productMetric === 'revenue' ? formatPrice(value) : value)} />
                    <Bar dataKey={productMetric} fill="#67232d" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Orders by status">
              {stats.ordersByStatus.length === 0 ? (
                <p className="text-sm text-[#9a7564]">No orders in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={stats.ordersByStatus} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {stats.ordersByStatus.map((entry, i) => (
                        <Cell key={entry.status} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Sales by category">
              {stats.categoryBreakdown.length === 0 ? (
                <p className="text-sm text-[#9a7564]">No category sales in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.categoryBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#decdb9" />
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#775e53' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#775e53' }} tickFormatter={(v) => formatPrice(v)} />
                    <Tooltip formatter={(value: number) => formatPrice(value)} />
                    <Bar dataKey="revenue" fill="#b83a36" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Top cities">
              {stats.topCities.length === 0 ? (
                <p className="text-sm text-[#9a7564]">No orders in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.topCities} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#decdb9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#775e53' }} tickFormatter={(v) => formatPrice(v)} />
                    <YAxis type="category" dataKey="city" width={90} tick={{ fontSize: 11, fill: '#775e53' }} />
                    <Tooltip formatter={(value: number) => formatPrice(value)} />
                    <Bar dataKey="revenue" fill="#c9a15a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Orders by day of week">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.ordersByWeekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#decdb9" />
                  <XAxis dataKey="weekday" tickFormatter={(v: string) => v.slice(0, 3)} tick={{ fontSize: 11, fill: '#775e53' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#775e53' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#8a5a2b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Payment methods">
              {stats.paymentMethodBreakdown.length === 0 ? (
                <p className="text-sm text-[#9a7564]">No orders in this range.</p>
              ) : (
                <div className="space-y-2">
                  {stats.paymentMethodBreakdown.map((row) => (
                    <div key={row.method} className="flex items-center justify-between rounded-xl border border-[#decdb9] px-4 py-2.5 text-sm">
                      <span className="text-[#67232d]">{row.method}</span>
                      <span className="text-[#9a7564]">{row.count} orders</span>
                      <span className="font-semibold text-[#67232d]">{formatPrice(row.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Low stock (under 10 units)">
            {stats.lowStock.length === 0 ? (
              <p className="text-sm text-[#9a7564]">Everything's well stocked.</p>
            ) : (
              <div className="space-y-2">
                {stats.lowStock.map((row, i) => (
                  <div key={`${row.productName}-${row.variantLabel}-${i}`} className="flex items-center justify-between rounded-xl border border-[#decdb9] px-4 py-2.5 text-sm">
                    <span className="text-[#67232d]">{row.productName} · {row.variantLabel}</span>
                    <span className={`font-semibold ${row.stockQty === 0 ? 'text-[#b83a36]' : 'text-[#8a5a2b]'}`}>{row.stockQty} left</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

type TeamUser = { id: string; email: string; name: string | null; phone: string | null; role: string; active: boolean; createdAt: string };
type AuditRow = { id: string; adminEmail: string; role: string; action: string; target: string | null; detail: string | null; createdAt: string };

const ROLE_OPTIONS = [
  { id: 'superadmin', label: 'Superadmin', hint: 'Everything, including managing the team' },
  { id: 'finance', label: 'Finance', hint: 'Orders (view/edit), invoices, payments, analytics, Excel export' },
  { id: 'logistics', label: 'Logistics', hint: 'View orders and WhatsApp chats only' },
];

async function teamFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong.');
  return data as T;
}

function TeamTab({ myEmail }: { myEmail: string }) {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ['admin-team'], queryFn: () => teamFetch<TeamUser[]>('/users') });
  const { data: audit } = useQuery({ queryKey: ['admin-audit'], queryFn: () => teamFetch<AuditRow[]>('/audit-log') });
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'finance', password: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['admin-team'] }); queryClient.invalidateQueries({ queryKey: ['admin-audit'] }); };

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: success });
      refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const addUser = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await teamFetch('/users', { method: 'POST', body: JSON.stringify({ ...form, phone: form.phone.trim() || null }) });
      setForm({ name: '', email: '', phone: '', role: 'finance', password: '' });
    }, 'Login created. Share the email and password with them privately.');
  };

  const patch = (id: string, body: Record<string, unknown>, success: string) =>
    run(() => teamFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), success);

  const field = 'mt-1.5 w-full rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9a15a]';
  const label = 'mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]';

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8" data-testid="tab-team-content">
      <h2 className="serif text-2xl text-[#67232d]">Team & access</h2>
      <p className="mt-1 text-xs text-[#9a7564]">Each person gets their own login. What they can see and do depends on their role.</p>

      {message ? <p className={`mt-4 rounded-lg px-4 py-2 text-xs ${message.ok ? 'bg-[#3f8f5f]/10 text-[#2f6b46]' : 'bg-[#b83a36]/10 text-[#b83a36]'}`} data-testid="text-team-message">{message.text}</p> : null}

      <div className="mt-6 space-y-3">
        {isLoading ? <p className="text-sm text-[#9a7564]">Loading…</p> : null}
        {users?.map((user) => {
          const isMe = user.email === myEmail;
          return (
            <div key={user.id} className={`rounded-[1.25rem] border bg-white p-4 ${user.active ? 'border-[#decdb9]' : 'border-[#decdb9] opacity-60'}`} data-testid={`row-user-${user.email}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#67232d]">{user.name ?? '—'} {isMe ? <span className="text-[10px] font-normal text-[#9a7564]">(you)</span> : null}{!user.active ? <span className="ml-2 rounded-full bg-[#b83a36]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#b83a36]">Deactivated</span> : null}</p>
                  <p className="truncate text-xs text-[#9a7564]">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={user.role}
                    disabled={busy || isMe}
                    onChange={(e) => void patch(user.id, { role: e.target.value }, `${user.email} is now ${e.target.value}.`)}
                    className="rounded-lg border border-[#decdb9] bg-white px-3 py-2 text-xs capitalize outline-none disabled:opacity-60"
                    aria-label={`Role for ${user.email}`}
                    title={isMe ? "You can't change your own role" : undefined}
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <button type="button" onClick={() => { setResetFor(resetFor === user.id ? null : user.id); setNewPassword(''); }} className="rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold text-[#67232d] hover:border-[#c9a15a]">Reset password</button>
                  {!isMe ? (
                    <button type="button" disabled={busy} onClick={() => void patch(user.id, { active: !user.active }, user.active ? `${user.email} can no longer log in.` : `${user.email} can log in again.`)} className="rounded-full border border-[#decdb9] px-4 py-2 text-xs font-semibold text-[#b83a36] hover:border-[#b83a36] disabled:opacity-60">
                      {user.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  ) : null}
                </div>
              </div>
              {resetFor === user.id ? (
                <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void patch(user.id, { password: newPassword }, `Password changed for ${user.email}. Share it privately.`).then(() => setResetFor(null)); }}>
                  <label className="block flex-1"><span className={label}>New password (min 8 characters)</span><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required className={field} /></label>
                  <button type="submit" disabled={busy} className="rounded-full bg-[#67232d] px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60">Save password</button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      <form onSubmit={addUser} className="mt-8 rounded-[1.5rem] border border-[#decdb9] bg-white p-6" data-testid="form-add-user">
        <p className={label}>Add a person</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs text-[#775e53]">Name *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={field} data-testid="input-user-name" /></label>
          <label className="block"><span className="text-xs text-[#775e53]">Email (their login) *</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={field} data-testid="input-user-email" /></label>
          <label className="block"><span className="text-xs text-[#775e53]">WhatsApp number (for WhatsApp login later)</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className={field} /></label>
          <label className="block"><span className="text-xs text-[#775e53]">Password * (min 8 characters)</span><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required className={field} data-testid="input-user-password" /></label>
          <div className="sm:col-span-2">
            <span className="text-xs text-[#775e53]">Role *</span>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
              {ROLE_OPTIONS.map((r) => (
                <button key={r.id} type="button" onClick={() => setForm({ ...form, role: r.id })} className={`rounded-xl border px-3 py-3 text-left transition-colors ${form.role === r.id ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`} data-testid={`button-role-${r.id}`}>
                  <span className="block text-xs font-semibold">{r.label}</span>
                  <span className={`mt-0.5 block text-[10px] ${form.role === r.id ? 'text-[#d9bfa9]' : 'text-[#9a7564]'}`}>{r.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="submit" disabled={busy} className="mt-4 flex items-center gap-2 rounded-full bg-[#67232d] px-6 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5] disabled:opacity-60" data-testid="button-add-user">Create login <Plus size={14} /></button>
      </form>

      <div className="mt-8 rounded-[1.5rem] border border-[#decdb9] bg-white p-6" data-testid="card-audit-log">
        <p className={label}>Recent activity</p>
        <div className="mt-3 max-h-[360px] overflow-y-auto">
          {!audit?.length ? <p className="text-xs text-[#9a7564]">Nothing recorded yet.</p> : null}
          {audit?.map((row) => (
            <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[#efe6d8] py-2 text-xs">
              <span className="text-[#67232d]"><span className="font-semibold">{row.adminEmail}</span> <span className="text-[#9a7564]">({row.role})</span> · {row.action}{row.target ? ` · ${row.target}` : ''}{row.detail ? <span className="text-[#775e53]"> — {row.detail}</span> : null}</span>
              <span className="mono text-[10px] text-[#9a7564]">{new Date(row.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [, navigate] = useLocation();
  const { data: me, isLoading, isError } = useAdminMe();
  const [tab, setTab] = useState<AdminTab>('orders');

  useEffect(() => {
    if (!isLoading && isError) navigate('/admin/login');
  }, [isLoading, isError, navigate]);

  // Land on the first tab this person is allowed to use (e.g. finance has no Products tab).
  const allowedTabs = me ? ALL_TABS.filter((t) => t.needs.some((permission) => me.permissions.includes(permission))) : [];
  useEffect(() => {
    if (me && allowedTabs.length > 0 && !allowedTabs.some((t) => t.id === tab)) setTab(allowedTabs[0]!.id);
  }, [me, tab]);

  if (isLoading) {
    return (
      <AdminShell>
        <div className="grid min-h-[100dvh] place-items-center text-sm text-[#9a7564]">Loading…</div>
      </AdminShell>
    );
  }

  if (!me) return null;

  return (
    <PermsContext.Provider value={me.permissions}>
      <AdminShell>
        <AdminHeader email={me.email} name={me.name} role={me.role} />
        <AdminTabs tab={tab} onChange={setTab} />
        {allowedTabs.length === 0 ? <p className="p-8 text-sm text-[#9a7564]">Your role doesn't have access to anything yet. Ask a superadmin.</p> : null}
        {tab === 'products' ? <ProductsTab /> : null}
        {tab === 'orders' ? <OrdersTab /> : null}
        {tab === 'whatsapp' ? <WhatsAppTab /> : null}
        {tab === 'analytics' ? <AnalyticsTab /> : null}
        {tab === 'settings' ? <SettingsTab /> : null}
        {tab === 'team' ? <TeamTab myEmail={me.email} /> : null}
      </AdminShell>
    </PermsContext.Provider>
  );
}
