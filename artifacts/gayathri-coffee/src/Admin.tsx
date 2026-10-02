import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X, Check, LogOut, ImagePlus, Package, Truck, Settings as SettingsIcon, BarChart3, MapPin, Phone, StickyNote, ExternalLink, Send } from 'lucide-react';
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

type AdminTab = 'products' | 'orders' | 'analytics' | 'settings';

function AdminTabs({ tab, onChange }: { tab: AdminTab; onChange: (tab: AdminTab) => void }) {
  const tabs: { id: AdminTab; label: string; icon: typeof Package }[] = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: Truck },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];
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

function AdminHeader({ email }: { email: string }) {
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
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#9a7564]">{email}</span>
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

export function AdminLoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();

  const login = useAdminLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getAdminMeQueryKey(), data);
        navigate('/admin');
      },
    },
  });

  return (
    <AdminShell>
      <div className="grid min-h-[100dvh] place-items-center px-5">
        <div className="w-full max-w-[380px] rounded-[1.5rem] border border-[#decdb9] bg-white p-8">
          <img src={logoPath} alt="" className="mx-auto h-14 w-14 rounded-full object-cover" />
          <h1 className="serif mt-4 text-center text-2xl text-[#67232d]">Admin sign in</h1>
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
    variants: [{ weightGrams: 1000, price: 0, sku: '', stockQty: 0, isDefault: true }],
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
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Weight & price</p>
              <button type="button" onClick={addVariant} className="flex items-center gap-1 text-xs font-semibold text-[#b83a36]" data-testid="button-add-variant">
                <Plus size={14} /> Add weight
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {draft.variants.map((variant, index) => (
                <div key={variant.id ?? index} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 rounded-xl border border-[#decdb9] bg-white p-3">
                  <label className="block">
                    <span className="mono text-[9px] uppercase text-[#9a7564]">Grams</span>
                    <input type="number" min={1} required value={variant.weightGrams} onChange={(e) => setVariant(index, { weightGrams: Number(e.target.value) })} className="w-full bg-transparent text-sm outline-none" data-testid={`input-variant-grams-${index}`} />
                  </label>
                  <label className="block">
                    <span className="mono text-[9px] uppercase text-[#9a7564]">Price (₹)</span>
                    <input type="number" min={0} required value={variant.price} onChange={(e) => setVariant(index, { price: Number(e.target.value) })} className="w-full bg-transparent text-sm outline-none" data-testid={`input-variant-price-${index}`} />
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
        <p className="product-name text-base text-[#67232d]">{order.orderNumber}</p>
        <p className="truncate text-xs text-[#9a7564]">{order.customerName} · {new Date(order.createdAt).toLocaleDateString('en-IN')} · {order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${order.shippingMethod === 'shiprocket' ? 'bg-[#c9a15a]/20 text-[#8a5a2b]' : 'bg-[#67232d]/10 text-[#67232d]'}`}>
        {order.shippingMethod === 'shiprocket' ? 'Shiprocket' : 'India Post'}
      </span>
      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] capitalize ${STATUS_STYLES[order.status] ?? 'bg-[#decdb9] text-[#67232d]'}`}>
        {order.status}
      </span>
      <span className="mono w-20 shrink-0 text-right text-sm text-[#67232d]">{formatPrice(order.total)}</span>
    </button>
  );
}

function OrderDetailModal({ order, onClose }: { order: OrderWithItems; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '');
  const [shipError, setShipError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
        setShipError(null);
        invalidate();
      },
      onError: (err) => setShipError(err instanceof Error ? err.message : 'Could not create the shipment.'),
    },
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#3a161e]/45 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet-in flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fdf8f1] sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#decdb9] px-6 py-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Order</p>
            <h2 className="serif text-xl text-[#67232d]">{order.orderNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#67232d] hover:bg-[#efe1d2]" data-testid="button-close-order-detail">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#decdb9] bg-white p-4">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Customer</p>
              <p className="mt-2 text-sm font-semibold text-[#67232d]">{order.customerName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#775e53]"><Phone size={12} /> {order.phone}</p>
            </div>
            <div className="rounded-xl border border-[#decdb9] bg-white p-4">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Delivery address</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[#775e53]"><MapPin size={12} className="mt-0.5 shrink-0" /> {order.address}, {order.city} {order.pincode}</p>
            </div>
          </div>

          {order.notes ? (
            <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Delivery notes</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[#775e53]"><StickyNote size={12} className="mt-0.5 shrink-0" /> {order.notes}</p>
            </div>
          ) : null}

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
              <div className="flex justify-between text-sm font-semibold text-[#67232d]"><span>Total</span><span className="mono">{formatPrice(order.total)}</span></div>
            </div>
            <p className="mt-2 text-xs text-[#9a7564]">Paid via {order.paymentMethod}</p>
          </div>

          <div className="mt-4 rounded-xl border border-[#decdb9] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Fulfillment</p>
              <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${order.shippingMethod === 'shiprocket' ? 'bg-[#c9a15a]/20 text-[#8a5a2b]' : 'bg-[#67232d]/10 text-[#67232d]'}`}>
                {order.shippingMethod === 'shiprocket' ? 'Shiprocket' : 'India Post'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2 w-full rounded-lg border border-[#decdb9] bg-transparent px-3 py-2 text-sm capitalize outline-none" data-testid="select-order-status">
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
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
            </div>

            {order.trackingUrl ? (
              <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#b83a36]">
                <ExternalLink size={12} /> Open current tracking link
              </a>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
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
                <button
                  type="button"
                  onClick={() => { setShipError(null); shipOrder.mutate({ id: order.id }); }}
                  disabled={shipOrder.isPending}
                  className="flex items-center gap-2 rounded-full border border-[#c9a15a] bg-[#c9a15a]/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a2b] disabled:opacity-60"
                  data-testid="button-create-shipment"
                >
                  {shipOrder.isPending ? 'Creating shipment…' : 'Create shipment via Shiprocket'} <Send size={14} />
                </button>
              ) : null}
            </div>
            {shipError ? <p className="mt-3 text-xs text-[#b83a36]" data-testid="text-ship-error">{shipError}</p> : null}
            {order.shippingMethod === 'india_post' ? (
              <p className="mt-3 text-xs text-[#9a7564]">India Post orders are booked manually — enter the tracking number once you've dispatched it at the post office.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersTab() {
  const { data: orders, isLoading } = useAdminListOrders();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrder = selectedId ? (orders?.find((o) => o.id === selectedId) ?? null) : null;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
      <h2 className="serif text-2xl text-[#67232d]">Orders</h2>
      <div className="mt-6 space-y-3">
        {isLoading ? <p className="text-sm text-[#9a7564]">Loading…</p> : null}
        {orders?.length === 0 ? <p className="text-sm text-[#9a7564]">No orders yet.</p> : null}
        {orders?.map((order) => <OrderSummaryRow key={order.id} order={order} onOpen={() => setSelectedId(order.id)} />)}
      </div>
      {selectedOrder ? <OrderDetailModal order={selectedOrder} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

type RateTierDraft = { weightGrams: number; price: number };

function SettingsTab() {
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

      <div className="mt-6 rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
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
      </div>
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

export function AdminPage() {
  const [, navigate] = useLocation();
  const { data: me, isLoading, isError } = useAdminMe();
  const [tab, setTab] = useState<AdminTab>('products');

  useEffect(() => {
    if (!isLoading && isError) navigate('/admin/login');
  }, [isLoading, isError, navigate]);

  if (isLoading) {
    return (
      <AdminShell>
        <div className="grid min-h-[100dvh] place-items-center text-sm text-[#9a7564]">Loading…</div>
      </AdminShell>
    );
  }

  if (!me) return null;

  return (
    <AdminShell>
      <AdminHeader email={me.email} />
      <AdminTabs tab={tab} onChange={setTab} />
      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'orders' ? <OrdersTab /> : null}
      {tab === 'analytics' ? <AnalyticsTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
    </AdminShell>
  );
}
