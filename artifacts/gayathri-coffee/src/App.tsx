import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coffee,
  Heart,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import logoPath from '@assets/Gayathri_Coffee_Logo_1789394897707.png';
import heroPath from '@assets/hero-poster.png';
import lottie from 'lottie-web';
import { useListProducts, useGetShippingSettings, useGetIndiaPostRate, getGetIndiaPostRateQueryKey, useGetShiprocketRate, getGetShiprocketRateQueryKey, useCreateOrder, useGetPaymentSettings, useCreateRazorpayOrder, type ProductWithDetails } from '@workspace/api-client-react';
import { AdminLoginPage, AdminPage } from './Admin';

const leafIcons = Array.from({ length: 8 }, (_, i) => `/icons/leaf-${String(i + 1).padStart(2, '0')}.svg`);
const [leafIcon1, leafIcon2, leafIcon3, leafIcon4, leafIcon5, leafIcon6, leafIcon7, leafIcon8] = leafIcons;

const categoryPhotoCoffee = '/categories/coffee.jpg';
const categoryPhotoPremium = '/categories/premium-coffee.jpg';
const categoryPhotoPure = '/categories/pure-coffee.png';
const categoryPhotoDecoction = '/categories/decoction.jpg';
const categoryPhotoTea = '/categories/tea.jpg';
const heritageLogo = '/mysore-heritage-logo.jpeg';
const coffeeMockup = '/coffee-mockup.png';
const heritageTimeline = '/history-1.webp';

type Product = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  price: number;
  weightGrams: number;
  category: 'Coffee Powder' | 'Premium Coffee' | 'Pure Coffee' | 'Decoction' | 'Tea' | 'Custom Blend';
  roast: string;
  notes: string;
  image: string;
  badge?: string;
};

type CartItem = { product: Product; quantity: number };

type CartContextValue = { cart: CartItem[]; setCart: Dispatch<SetStateAction<CartItem[]>> };
const CartContext = createContext<CartContextValue | null>(null);

function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  return <CartContext.Provider value={{ cart, setCart }}>{children}</CartContext.Provider>;
}

function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}

function mapApiProduct(apiProduct: ProductWithDetails): Product {
  const defaultVariant = apiProduct.variants.find((variant) => variant.isDefault) ?? apiProduct.variants[0];
  const primaryImage = apiProduct.images.find((image) => image.isPrimary) ?? apiProduct.images[0];
  return {
    id: apiProduct.slug,
    name: apiProduct.name,
    shortName: apiProduct.shortName,
    description: apiProduct.description,
    price: defaultVariant?.price ?? 0,
    weightGrams: defaultVariant?.weightGrams ?? 1000,
    category: apiProduct.category as Product['category'],
    roast: apiProduct.roast,
    notes: apiProduct.notes,
    image: primaryImage?.url ?? coffeeMockup,
    badge: apiProduct.badge ?? undefined,
  };
}

type CategoryShot = {
  label: string;
  filter: string;
  tagline: string;
  image: string;
};

const announcementBarItems = Array.from({ length: 5 }, () => 'Hand-roasted in Mysore since 1950 · Shipped across India');

const marqueeItems = [
  { label: 'Filter coffee for slow mornings', icon: leafIcon1 },
  { label: 'Selected in Mysore', icon: leafIcon2 },
  { label: 'Roasted with care', icon: leafIcon3 },
  { label: 'Small batch, big flavour', icon: leafIcon4 },
  { label: 'From Malleshwaram since 2002', icon: leafIcon5 },
  { label: 'No shortcuts, no chemicals', icon: leafIcon6 },
  { label: 'The South Indian filter ritual', icon: leafIcon7 },
  { label: 'Honest coffee, honestly roasted', icon: leafIcon8 },
];

const ritualSteps = [
  { title: 'Boil the water', description: 'Let the kettle have its moment.', icon: leafIcon6 },
  { title: 'Add the decoction', description: 'Strong, smooth, to your measure.', icon: leafIcon7 },
  { title: 'Take the first sip', description: 'Steel tumbler optional. Comfort is not.', icon: leafIcon8 },
];

const categoryShots: CategoryShot[] = [
  { label: 'Premium Coffee', filter: 'Premium Coffee', tagline: 'Rare, limited lots', image: categoryPhotoPremium },
  { label: 'Coffee Powder', filter: 'Coffee Powder', tagline: 'Everyday filter blends', image: categoryPhotoCoffee },
  { label: 'Pure Coffee', filter: 'Pure Coffee', tagline: 'Single-estate, unblended', image: categoryPhotoPure },
  { label: 'Decoction', filter: 'Decoction', tagline: 'Ready-to-pour concentrate', image: categoryPhotoDecoction },
  { label: 'Tea', filter: 'Tea', tagline: 'Estate-grown leaves', image: categoryPhotoTea },
];

// Keep these names exact — the backend matches them to decide CGST+SGST vs IGST on the invoice.
const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];

type PackWeight = { label: string; grams: number; factor: number };
const packWeights: PackWeight[] = [
  { label: '250 g', grams: 250, factor: 0.3 },
  { label: '500 g', grams: 500, factor: 0.55 },
];

type ProductGrind = 'Coarse (Filter)' | 'Fine';
const productGrindOptions: ProductGrind[] = ['Coarse (Filter)', 'Fine'];

const navItems = [
  { label: 'Shop', href: '#shop' },
  { label: 'Our story', href: '#story' },
  { label: 'Custom roast', href: '/custom-roast' },
  { label: 'B2B', href: '#b2b' },
];
// Default staleTime avoids an immediate, redundant refetch when a mutation
// (e.g. admin login) has just written fresh data into the cache via
// setQueryData — without this, every query is stale on mount and refires.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function categorySlug(label: string) {
  return `category-${label.toLowerCase().replace(/\s+/g, '-')}`;
}

type FlyingBean = { id: number; startX: number; startY: number; endX: number; endY: number; delay: number };

function FlyingBeanSprite({ bean }: { bean: FlyingBean }) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <img
      src={leafIcon1}
      alt=""
      aria-hidden="true"
      className="pointer-events-none fixed z-[250] h-7 w-7 transition-all duration-[900ms] ease-[cubic-bezier(.4,0,.2,1)]"
      style={{
        left: landed ? bean.endX : bean.startX,
        top: landed ? bean.endY : bean.startY,
        transform: `translate(-50%, -50%) scale(${landed ? 0.3 : 1}) rotate(${landed ? 200 : 0}deg)`,
        opacity: landed ? 0 : 1,
        transitionDelay: `${bean.delay}ms`,
        willChange: 'left, top, transform, opacity',
      }}
    />,
    document.body,
  );
}

function ProductCard({
  product,
  onAdd,
  onQuickView,
  isFavorite,
  onFavorite,
}: {
  product: Product;
  onAdd: (product: Product, originRect: DOMRect) => void;
  onQuickView: (product: Product) => void;
  isFavorite: boolean;
  onFavorite: (id: string) => void;
}) {
  return (
    <article
      className="group relative flex w-[78vw] shrink-0 cursor-pointer snap-center flex-col overflow-hidden rounded-[1.45rem] border border-[#decdb9] bg-[#f8f1e8] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(86,27,35,.14)] sm:w-[300px]"
      onClick={() => onQuickView(product)}
      data-testid={`card-product-${product.id}`}
    >
      <div className="relative overflow-hidden border-b border-[#ece3d3] bg-white">
        {product.badge ? (
          <span className="absolute left-4 top-4 z-10 rounded-full bg-[#f9e7c5] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-[#67232d]">
            {product.badge}
          </span>
        ) : null}
        <button
          type="button"
          className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-[#f9e7c5]/60 bg-[#f9e7c5]/80 text-[#67232d] transition-colors hover:bg-[#f9e7c5]"
          onClick={(event) => { event.stopPropagation(); onFavorite(product.id); }}
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${product.name} ${isFavorite ? 'from' : 'to'} favorites`}
          data-testid={`button-favorite-${product.id}`}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <div
          className="grid h-[230px] w-full cursor-zoom-in place-items-center"
          aria-label={`View details for ${product.name}`}
          data-testid={`button-view-${product.id}`}
        >
          <img src={product.image} alt={`${product.name} coffee pack`} className="max-h-[85%] max-w-[65%] object-contain drop-shadow-[0_14px_16px_rgba(55,25,10,.16)]" />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <h3 className="product-name text-xl leading-tight text-[#67232d]">{product.name}</h3>
        <p className="mt-1 text-xs text-[#9a7564]">{product.category} · {product.roast}</p>
        <p className="mono mt-2 text-base font-semibold text-[#67232d]">{formatPrice(product.price)}</p>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onAdd(product, event.currentTarget.getBoundingClientRect()); }}
          className="group/add mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#67232d] px-4 py-2.5 text-xs font-semibold text-[#f9e7c5] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          data-testid={`button-add-${product.id}`}
        >
          Add to basket <Plus size={14} className="transition-transform group-hover/add:rotate-90" />
        </button>
      </div>
    </article>
  );
}

function CartDrawer({
  items,
  open,
  onClose,
  onChange,
  onRemove,
  onCheckout,
}: {
  items: CartItem[];
  open: boolean;
  onClose: () => void;
  onChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[160]" role="dialog" aria-modal="true" aria-label="Your coffee basket">
      <button className="absolute inset-0 cursor-default bg-[#3a161e]/45 backdrop-blur-[2px]" onClick={onClose} aria-label="Close basket" data-testid="button-close-cart-overlay" />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col bg-[#f8f1e8] shadow-[-18px_0_50px_rgba(86,27,35,.18)]">
        <header className="flex items-center justify-between border-b border-[#decdb9] px-6 py-5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.22em] text-[#9a7564]">Your basket</p>
            <h2 className="serif mt-1 text-3xl text-[#67232d]">For the next pour.</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border border-[#decdb9] text-[#67232d] hover:bg-[#efe1d2]" aria-label="Close basket" data-testid="button-close-cart">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-auto px-6 py-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-5 grid size-20 place-items-center rounded-full bg-[#c9a15a] text-[#67232d]"><Coffee size={30} /></div>
              <h3 className="serif text-2xl text-[#67232d]">It is quiet in here.</h3>
              <p className="mt-2 max-w-[230px] text-sm leading-relaxed text-[#775e53]">Find a bag for your filter, moka pot, or the familiar steel tumbler.</p>
              <button type="button" onClick={onClose} className="mt-6 rounded-full bg-[#67232d] px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5]" data-testid="button-browse-cart">Browse the coffee</button>
            </div>
          ) : (
            <div className="space-y-5">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex gap-4 border-b border-[#decdb9] pb-5" data-testid={`cart-item-${product.id}`}>
                  <div className="grid size-[82px] shrink-0 place-items-center rounded-xl border border-[#decdb9] bg-white p-1.5">
                    <img src={product.image} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <h3 className="product-name text-lg text-[#67232d]">{product.name}</h3>
                      <button type="button" onClick={() => onRemove(product.id)} className="text-[#9a7564] hover:text-[#b83a36]" aria-label={`Remove ${product.name}`} data-testid={`button-remove-${product.id}`}><Trash2 size={15} /></button>
                    </div>
                    <p className="mono mt-1 text-xs text-[#775e53]">{formatPrice(product.price)}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-[#cdb9a4] bg-[#fdf8f1]">
                        <button type="button" onClick={() => onChange(product.id, -1)} className="grid size-7 place-items-center text-[#67232d]" aria-label={`Decrease ${product.name} quantity`} data-testid={`button-decrease-${product.id}`}><Minus size={13} /></button>
                        <span className="mono w-7 text-center text-xs text-[#67232d]" data-testid={`text-quantity-${product.id}`}>{quantity}</span>
                        <button type="button" onClick={() => onChange(product.id, 1)} className="grid size-7 place-items-center text-[#67232d]" aria-label={`Increase ${product.name} quantity`} data-testid={`button-increase-${product.id}`}><Plus size={13} /></button>
                      </div>
                      <span className="mono text-sm font-medium text-[#67232d]">{formatPrice(product.price * quantity)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 ? (
          <div className="border-t border-[#decdb9] bg-[#f1e5d8] px-6 pb-7 pt-5">
            <div className="flex justify-between text-sm text-[#775e53]"><span>Subtotal</span><span className="mono font-medium text-[#67232d]">{formatPrice(subtotal)}</span></div>
            <p className="mt-2 text-xs text-[#9a7564]">Shipping is calculated at checkout based on your pincode.</p>
            <button type="button" onClick={onCheckout} className="mt-5 flex w-full items-center justify-center gap-3 rounded-full bg-[#b83a36] px-5 py-4 text-sm font-semibold text-[#fdf8f1] transition-transform hover:-translate-y-0.5" data-testid="button-checkout">Continue to checkout <ArrowRight size={16} /></button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function BeanBounceLottie({ playKey }: { playKey: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<ReturnType<typeof lottie.loadAnimation> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    animRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: '/animations/coffee-beans.json',
    });
    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (playKey > 0) animRef.current?.goToAndPlay(0, true);
  }, [playKey]);

  return <div ref={containerRef} className="h-28 w-28" />;
}

const customerCountries = [
  { name: 'India', x: 70.27, y: 43.56, customers: 20400 },
  { name: 'United States', x: 26.14, y: 31.19, customers: 38700 },
  { name: 'Canada', x: 26.51, y: 19.19, customers: 12300 },
  { name: 'Mexico', x: 23.86, y: 42.83, customers: 7800 },
  { name: 'Colombia', x: 30.83, y: 56.63, customers: 5200 },
  { name: 'Brazil', x: 36.4, y: 66.76, customers: 14600 },
  { name: 'Argentina', x: 34.11, y: 84.23, customers: 6100 },
  { name: 'United Kingdom', x: 49.55, y: 20.55, customers: 27900 },
  { name: 'Germany', x: 52.29, y: 22.63, customers: 18800 },
  { name: 'France', x: 50.47, y: 25.8, customers: 15400 },
  { name: 'Italy', x: 53, y: 28.65, customers: 9700 },
  { name: 'Spain', x: 49.1, y: 30.46, customers: 8900 },
  { name: 'Russia', x: 63.11, y: 17.85, customers: 6800 },
  { name: 'Turkey', x: 58.52, y: 31.19, customers: 11200 },
  { name: 'Egypt', x: 57.63, y: 40.65, customers: 5600 },
  { name: 'Saudi Arabia', x: 61.51, y: 42.11, customers: 16300 },
  { name: 'UAE', x: 63.81, y: 42.11, customers: 31700 },
  { name: 'Nigeria', x: 52.09, y: 52.64, customers: 4900 },
  { name: 'Kenya', x: 59.96, y: 59.17, customers: 3800 },
  { name: 'South Africa', x: 56.06, y: 80.58, customers: 10500 },
  { name: 'China', x: 75.73, y: 34.1, customers: 22100 },
  { name: 'Japan', x: 84.01, y: 33.37, customers: 13400 },
  { name: 'South Korea', x: 81.44, y: 33, customers: 8300 },
  { name: 'Thailand', x: 76.27, y: 48.65, customers: 9100 },
  { name: 'Sri Lanka', x: 71.15, y: 53.88, customers: 6400 },
  { name: 'Singapore', x: 77.28, y: 58.55, customers: 17600 },
  { name: 'Indonesia', x: 79.69, y: 60.98, customers: 7300 },
  { name: 'Australia', x: 84.18, y: 77.67, customers: 19500 },
  { name: 'New Zealand', x: 91.51, y: 89.31, customers: 4400 },
];
const totalCustomers = customerCountries.reduce((sum, country) => sum + country.customers, 0);

function formatCustomers(value: number) {
  return `${(value / 1000).toFixed(1)}k`;
}

function CustomerMap() {
  const [active, setActive] = useState<string | null>(null);
  const activeCountry = customerCountries.find((country) => country.name === active) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.55;
  }, []);

  return (
    <section id="customers" className="pattern-bg relative overflow-hidden bg-[#67232d] text-[#f9e7c5]" style={{ '--pattern-opacity': '.08', '--pattern-blend': 'soft-light' } as CSSProperties}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
        <div className="text-center">
          <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Our customers</p>
          <h2 className="serif mt-3 text-3xl sm:text-5xl">Poured in {customerCountries.length} countries.</h2>
          <p className="mx-auto mt-4 max-w-[520px] text-sm leading-[1.8] text-[#f7dec1]">
            More than {totalCustomers.toLocaleString('en-IN')} cups-a-day loyalists across every continent. Tap a pointer to see who is drinking where.
          </p>
        </div>

        <p className="mono mt-8 text-center text-[10px] uppercase tracking-[.18em] text-[#c9a15a]/80 md:hidden">Swipe to explore the map</p>
        <div ref={scrollRef} className="mx-auto mt-4 w-full max-w-[1100px] overflow-x-auto pb-4 pt-2 md:mt-12 md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onClick={() => setActive(null)}>
          <div className="relative aspect-[1000/420] w-full min-w-[780px]">
            <img src="/world-map.svg" alt="World map of Gayathri Coffee customers" className="absolute inset-0 h-full w-full select-none" draggable={false} />
            {customerCountries.map((country, index) => {
              const isActive = country.name === active;
              return (
                <button
                  key={country.name}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setActive(isActive ? null : country.name); }}
                  className="absolute z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center sm:size-7"
                  style={{ left: `${country.x}%`, top: `${country.y}%` }}
                  aria-label={`${country.name}: ${formatCustomers(country.customers)} customers`}
                  aria-pressed={isActive}
                  data-testid={`pin-${country.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span className={`relative block rounded-full transition-all ${isActive ? 'size-3.5' : 'size-2.5'}`}>
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#f9e7c5] opacity-70" style={{ animationDelay: `${(index % 7) * 220}ms`, animationDuration: '1.8s' }} />
                    <span className={`relative block size-full rounded-full ring-2 ring-[#67232d] ${isActive ? 'bg-[#f9e7c5]' : 'bg-[#c9a15a]'}`} />
                  </span>
                </button>
              );
            })}
            {activeCountry ? (
              <div
                className="pointer-events-none absolute z-20 w-[150px] rounded-2xl bg-[#fdf8f1] px-4 py-3 text-center text-[#67232d] shadow-[0_18px_40px_rgba(0,0,0,.35)]"
                style={{
                  left: `${activeCountry.x}%`,
                  top: `${activeCountry.y}%`,
                  transform: `translate(${activeCountry.x < 16 ? '-14%' : activeCountry.x > 84 ? '-86%' : '-50%'}, ${activeCountry.y < 34 ? '20px' : 'calc(-100% - 18px)'})`,
                }}
                data-testid="map-tooltip"
              >
                <p className="mono text-[10px] uppercase tracking-[.16em] text-[#9a7564]">{activeCountry.name}</p>
                <p className="serif mt-1 text-3xl leading-none">{formatCustomers(activeCountry.customers)}</p>
                <p className="mt-1 text-xs text-[#775e53]">customers</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Storefront({ onSwitchBrand }: { onSwitchBrand: (originX: string, originY: string) => void }) {
  const [, navigate] = useLocation();
  const { cart, setCart } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [flyingBeans, setFlyingBeans] = useState<FlyingBean[]>([]);
  const [beanCartIcon, setBeanCartIcon] = useState(false);
  const [addSheetProduct, setAddSheetProduct] = useState<Product | null>(null);
  const [sheetWeight, setSheetWeight] = useState<PackWeight>(packWeights[1]);
  const [sheetGrind, setSheetGrind] = useState<ProductGrind>('Coarse (Filter)');
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const beanIdRef = useRef(0);

  const { data: apiProducts, isLoading: productsLoading } = useListProducts();
  const products = useMemo(() => (apiProducts ?? []).map(mapApiProduct), [apiProducts]);
  const groupedProducts = useMemo(
    () =>
      categoryShots
        .map((category) => ({
          category,
          items: products.filter((product) => product.category === category.filter),
        }))
        .filter((group) => group.items.length > 0),
    [products],
  );
  const totalVisible = groupedProducts.reduce((sum, group) => sum + group.items.length, 0);

  const openAddSheet = (product: Product) => {
    setAddSheetProduct(product);
    setSheetWeight(packWeights[1]);
    setSheetGrind('Coarse (Filter)');
  };

  const openQuickView = (product: Product) => {
    setQuickView(product);
    setSheetWeight(packWeights[1]);
    setSheetGrind('Coarse (Filter)');
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    document.body.style.overflow = cartOpen || addSheetProduct || quickView ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen, addSheetProduct, quickView]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const addToCart = (product: Product, originRect: DOMRect) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1 }];
    });

    const cartRect = cartButtonRef.current?.getBoundingClientRect();
    if (!cartRect) {
      setAddedId(product.id);
      setBeanCartIcon(true);
      window.setTimeout(() => setAddedId(null), 650);
      return;
    }

    const seedId = beanIdRef.current;
    const count = 3;
    beanIdRef.current += count;
    const sx = originRect.left + originRect.width / 2;
    const sy = originRect.top + originRect.height / 2;
    const ex = cartRect.left + cartRect.width / 2;
    const ey = cartRect.top + cartRect.height / 2;
    const newBeans: FlyingBean[] = Array.from({ length: count }, (_, i) => ({
      id: seedId + i,
      startX: sx + (Math.random() - 0.5) * 18,
      startY: sy + (Math.random() - 0.5) * 18,
      endX: ex + (Math.random() - 0.5) * 10,
      endY: ey + (Math.random() - 0.5) * 10,
      delay: i * 90,
    }));
    setFlyingBeans((current) => [...current, ...newBeans]);

    const landTime = 900 + (count - 1) * 90;
    window.setTimeout(() => {
      setFlyingBeans((current) => current.filter((b) => b.id < seedId || b.id >= seedId + count));
      setAddedId(product.id);
      setBeanCartIcon(true);
      window.setTimeout(() => setAddedId(null), 500);
    }, landTime);
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((current) => current.flatMap((item) => {
      if (item.product.id !== id) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const scrollTo = (href: string) => {
    setMobileNav(false);
    if (href.startsWith('/')) {
      navigate(href);
      return;
    }
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="grain min-h-[100dvh] overflow-x-clip bg-[#f8f1e8] text-[#67232d]">
      <div className="marquee bg-[#67232d] py-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#f7d552]">
        <div className="marquee-track gap-10">
          {[...announcementBarItems, ...announcementBarItems].map((text, index) => (
            <span key={index} className="flex items-center gap-10">
              <span>{text}</span>
            </span>
          ))}
        </div>
      </div>
      <div className={`sticky top-0 z-40 transition-[background-color,box-shadow] duration-300 ${scrolled ? 'bg-[#f8f1e8]/95 shadow-[0_8px_24px_rgba(86,27,35,.12)] backdrop-blur-sm' : 'bg-[#f8f1e8]'}`}>
        <header className={`relative mx-auto flex max-w-[1400px] items-center justify-between px-5 transition-[padding] duration-300 sm:px-8 lg:px-12 ${scrolled ? 'py-3' : 'py-5'}`}>
          <button type="button" onClick={() => scrollTo('#top')} className="flex items-center gap-3" aria-label="Gayathri Coffee home" data-testid="button-home">
            <img src={logoPath} alt="Gayathri Coffee" className={`w-auto object-contain object-left transition-[height] duration-300 ${scrolled ? 'h-12 sm:h-14' : 'h-16 sm:h-[76px]'}`} />
          </button>
          <nav className="hidden items-center gap-8 text-xs font-semibold uppercase tracking-[.15em] text-[#775e53] md:flex" aria-label="Main navigation">
            {navItems.map((item) => <button key={item.href} type="button" onClick={() => scrollTo(item.href)} className="transition-colors hover:text-[#b83a36]" data-testid={`link-${item.label.toLowerCase().replace(' ', '-')}`}>{item.label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onSwitchBrand(`${rect.left + rect.width / 2}px`, `${rect.top + rect.height / 2}px`);
              }}
              className="rounded-full bg-[#67232d] px-3 py-2 text-[11px] font-semibold uppercase tracking-[.1em] text-[#c9a15a] transition-transform hover:-translate-y-0.5 sm:px-4 sm:text-xs sm:tracking-[.12em]"
              data-testid="link-mysore-heritage"
            >
              Mysore Heritage Coffee
            </button>
            <button ref={cartButtonRef} type="button" onClick={() => setCartOpen(true)} className={`relative grid size-10 place-items-center rounded-full bg-[#c9a15a] text-[#67232d] ${addedId ? 'animate-cart-pop' : ''}`} aria-label={`Open basket with ${cartCount} item${cartCount === 1 ? '' : 's'}`} data-testid="button-cart">{beanCartIcon ? <img src={leafIcon1} alt="" className="h-[18px] w-[18px]" style={{ filter: 'brightness(0) saturate(100%)' }} /> : <ShoppingBag size={18} />}<span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#b83a36] text-[10px] font-bold text-[#fdf8f1]" data-testid="text-cart-count">{cartCount}</span></button>
            <button type="button" onClick={() => setMobileNav((value) => !value)} className="grid size-10 place-items-center rounded-full border border-[#decdb9] text-[#67232d] md:hidden" aria-label="Toggle menu" data-testid="button-menu"><Menu size={19} /></button>
          </div>
          {mobileNav ? (
            <div className="absolute left-4 right-4 top-[92px] rounded-2xl border border-[#decdb9] bg-[#f8f1e8] p-3 shadow-xl md:hidden">
              {navItems.map((item) => <button type="button" key={item.href} onClick={() => scrollTo(item.href)} className="block w-full rounded-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-[.15em] text-[#775e53] hover:bg-[#efe1d2]" data-testid={`mobile-link-${item.label.toLowerCase().replace(' ', '-')}`}>{item.label}</button>)}
            </div>
          ) : null}
        </header>
      </div>

      <main id="top">
        <section className="relative">
          <div className="animate-rise overflow-hidden">
            <img
              src={heroPath}
              alt="The full Gayathri Coffee lineup — Robusta AA, Pure-A and Mysore Nuggets bags lined up on a wooden counter in the roastery"
              className="h-[420px] w-full object-cover sm:h-[560px] lg:h-[760px]"
            />
          </div>
        </section>

        <div className="marquee border-y border-[#e2d5c1] bg-[#fdfbf6] py-3.5 text-[#67232d]">
          <div className="marquee-track gap-8 text-[10px] font-semibold uppercase tracking-[.22em]">
            {[...marqueeItems, ...marqueeItems].map((item, index) => (
              <span key={`${item.label}-${index}`} className="flex items-center gap-8">
                <span>{item.label}</span>
                <img src={item.icon} alt="" className="h-4 w-4 opacity-40" />
              </span>
            ))}
          </div>
        </div>

        <section className="mx-auto max-w-[1400px] px-5 pt-16 pb-16 sm:px-8 sm:pt-20 sm:pb-20 lg:px-12 lg:pb-8">
          <div className="mb-9 text-center sm:mb-12">
            <p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">Pick your pour</p>
            <h2 className="serif mt-2 text-3xl text-[#67232d] sm:text-4xl">Shop by category</h2>
          </div>
          <div className="flex snap-x snap-mandatory gap-8 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:gap-12 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {categoryShots.map((category) => (
              <button
                type="button"
                key={category.label}
                onClick={() => scrollTo(`#${categorySlug(category.label)}`)}
                className="category-card group flex shrink-0 snap-center flex-col items-center gap-3"
                data-testid={`button-category-${category.label.toLowerCase().replace(' ', '-')}`}
              >
                <span className="category-ring inline-block rounded-full">
                  <span className="grid size-28 place-items-center overflow-hidden rounded-full bg-[#f8f1e8] sm:size-36">
                    <img src={category.image} alt="" className="h-full w-full scale-[1.4] object-cover" />
                  </span>
                </span>
                <span className="category-label text-xs font-semibold uppercase tracking-[.14em] text-[#67232d] transition-colors">{category.label}</span>
                <span className="text-[11px] text-[#9a7564]">{category.tagline}</span>
              </button>
            ))}
          </div>
        </section>

        <section id="shop" className="mx-auto max-w-[1400px] px-5 pt-20 pb-20 sm:px-8 md:pb-28 lg:px-12">
          <div><p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">The coffee shelf</p><h2 className="serif mt-3 max-w-[550px] text-4xl leading-none tracking-[-.035em] text-[#67232d] sm:text-6xl">Find your<br /><em>everyday favourite.</em></h2></div>

          <div className="mt-12 flex flex-col gap-14 sm:gap-16">
            {productsLoading ? (
              <p className="text-center text-sm text-[#9a7564]">Loading the shelf…</p>
            ) : groupedProducts.length === 0 ? (
              <p className="text-center text-sm text-[#9a7564]">No coffees are on the shelf right now — check back soon.</p>
            ) : null}
            {groupedProducts.map((group) => (
              <div key={group.category.label} id={categorySlug(group.category.label)}>
                <div className="mb-6 flex items-center gap-4">
                  <h3 className="product-name text-xl text-[#67232d] sm:text-2xl">{group.category.label}</h3>
                  <span className="h-px flex-1 bg-[#e2d5c1]" />
                  <span className="mono whitespace-nowrap text-[10px] uppercase tracking-[.16em] text-[#9a7564]">{group.items.length} {group.items.length === 1 ? 'coffee' : 'coffees'}</span>
                </div>
                <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                  {group.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAdd={openAddSheet}
                      onQuickView={openQuickView}
                      isFavorite={favorites.includes(product.id)}
                      onFavorite={(id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-7 text-center text-xs text-[#9a7564]">{totalVisible} coffees in the current pour</p>
        </section>

        <section id="story" className="pattern-bg relative overflow-hidden bg-[#67232d] text-[#f9e7c5]" style={{ '--pattern-opacity': '.1', '--pattern-blend': 'soft-light' } as CSSProperties}>
          <div className="absolute -right-32 -top-32 size-[430px] rounded-full border border-[#c9a15a]/20" /><div className="absolute -right-12 -top-12 size-[270px] rounded-full border border-[#c9a15a]/20" />
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-12">
            <div className="relative">
              <div className="absolute -left-5 top-8 h-28 w-1 bg-[#c9a15a]" />
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Est. 1950 · Mysore, Karnataka</p>
              <h2 className="serif mt-5 max-w-[510px] text-5xl leading-[.98] tracking-[-.04em] sm:text-7xl">The taste of <em>staying awhile.</em></h2>
            </div>
            <div className="max-w-[570px] lg:justify-self-end">
              <p className="text-lg leading-[1.65] text-[#f7dec1]">Gayathri Coffee Works began in 1950, when Mr. DC Varadaraja Setty started roasting and selling coffee from Mysore — door to door, by bicycle. No shortcuts, no additives, just time and care in every batch.</p>
              <p className="mt-6 text-[14px] leading-[1.75] text-[#d9bfa9]">In 1982, Mr. DV Ravikumar carried the roastery forward, and by 2002 our blends had reached the aromatic lanes of Malleshwaram, Bengaluru. In 2013, we became the first in Mysore to roast with German precision technology — without losing the hand-roasted soul we started with.</p>
              <button type="button" onClick={() => scrollTo('#ritual')} className="mt-8 flex items-center gap-3 border-b border-[#c9a15a] pb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#c9a15a]" data-testid="button-discover-story">Discover the ritual <ArrowRight size={15} /></button>
            </div>
          </div>
        </section>

        <section id="heritage" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="rounded-[2rem] border border-[#decdb9] bg-[#fdf8f1] p-8 sm:p-12">
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">About us</p>
              <h2 className="serif mt-4 text-4xl leading-tight text-[#67232d] sm:text-5xl">From Mysore soil to a better cup.</h2>
              <p className="mt-6 text-sm leading-[1.8] text-[#775e53]">Legend has it that Baba Budan carried the first seven coffee seeds from Mocha to the hills of Chikmagalur in the 17th century — the roots of India's coffee culture. Four centuries later, we still buy from those same hills: single-origin lots from Coorg and Chikmagalur, grown above 3,000 ft and hand-picked for sweetness and clarity.</p>
              <div className="mt-8 grid gap-4">
                <div className="flex items-center gap-3 rounded-2xl border border-[#decdb9] px-4 py-4">
                  <MapPin size={20} className="text-[#b83a36]" />
                  <span className="text-sm font-semibold text-[#67232d]">Coorg & Chikmagalur estates, 3,000+ ft — sustainably sourced, single-origin beans.</span>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[#decdb9] px-4 py-4">
                  <Coffee size={20} className="text-[#b83a36]" />
                  <span className="text-sm font-semibold text-[#67232d]">Hand roasted since 1950 — no fast process, no additives, just time and care.</span>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[#decdb9] px-4 py-4">
                  <Sparkles size={20} className="text-[#b83a36]" />
                  <span className="text-sm font-semibold text-[#67232d]">Arabica, Robusta, Peaberry & Mysore Nuggets — curated blends for every palate.</span>
                </div>
              </div>
            </div>
            <div className="rounded-[2rem] bg-[#67232d] p-8 text-[#f9e7c5] shadow-[0_24px_50px_rgba(86,27,35,.20)] sm:p-12">
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Heritage coffee</p>
              <div className="mt-7 space-y-6">
                <div className="border-b border-[#f9e7c5]/30 pb-5">
                  <span className="serif text-5xl leading-none">1950</span>
                  <p className="mt-2 text-sm leading-[1.7] text-[#f7dec1]">Founded in Mysore by Mr. DC Varadaraja Setty, roasting and selling coffee by bicycle.</p>
                </div>
                <div className="border-b border-[#f9e7c5]/30 pb-5">
                  <span className="serif text-5xl leading-none">2013</span>
                  <p className="mt-2 text-sm leading-[1.7] text-[#f7dec1]">First in Mysore to roast with German precision technology — without losing the hand-roasted soul.</p>
                </div>
                <div>
                  <span className="serif text-5xl leading-none">2026</span>
                  <p className="mt-2 text-sm leading-[1.7] text-[#f7dec1]">Mysore Heritage Coffee opens its doors — the tradition steps into a café.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="animate-rise text-center">
            <p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">From seed to cup</p>
            <h2 className="serif mt-3 text-3xl text-[#67232d] sm:text-4xl">A journey through time.</h2>
            <p className="mx-auto mt-4 max-w-[560px] text-sm leading-[1.8] text-[#775e53]">From a bicycle delivery round in 1950 to the coffee you're holding today — the full legacy, in one frame.</p>
          </div>
          <div className="animate-rise mt-10 overflow-hidden rounded-[1.5rem] border border-[#decdb9] shadow-[0_30px_80px_rgba(86,27,35,.18)]">
            <img src={heritageTimeline} alt="The Gayathri Coffee legacy: a journey through time, from 1950 to today" className="w-full" loading="lazy" />
          </div>
        </section>

        <section className="relative overflow-hidden">
          <video
            src="/video/coffee-marketing.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="h-[340px] w-full object-cover sm:h-[440px] lg:h-[560px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1f0c10]/85 via-[#1f0c10]/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-[1400px] px-5 pb-8 sm:px-8 sm:pb-12 lg:px-12">
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Watch our story</p>
              <h2 className="serif mt-2 max-w-[560px] text-3xl leading-tight text-[#fdf8f1] sm:text-5xl">From the roastery to your cup.</h2>
            </div>
          </div>
        </section>

        <CustomerMap />

        <section id="custom" className="pattern-bg border-y border-[#decdb9] bg-[#b83a36]" style={{ '--pattern-opacity': '.06' } as CSSProperties}>
          <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-12">
            <div className="text-[#f9e7c5]">
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Custom coffee</p>
              <h2 className="serif mt-4 text-4xl leading-tight text-[#f9e7c5] sm:text-5xl">Create your own roast profile.</h2>
              <p className="mt-6 text-sm leading-[1.8] text-[#f7dec1]">Pick two coffee types, dial in your chicory and grind, and watch the beans come alive as you build your own blend.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="rounded-full border border-[#f9e7c5]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#f9e7c5]">Roast profile</span>
                <span className="rounded-full border border-[#f9e7c5]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#f9e7c5]">Volume planning</span>
                <span className="rounded-full border border-[#f9e7c5]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#f9e7c5]">Recipe support</span>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[2rem] bg-[#f8f1e8] p-8 text-center sm:p-12">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full border border-[#decdb9]" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 size-48 rounded-full border border-[#decdb9]" />
              <div className="relative mx-auto grid size-20 place-items-center rounded-full bg-[#67232d] text-[#c9a15a] shadow-[0_16px_36px_rgba(86,27,35,.25)]">
                <img src={leafIcon1} alt="" className="h-9 w-9" style={{ filter: 'brightness(0) saturate(100%) invert(80%) sepia(24%) saturate(660%) hue-rotate(357deg) brightness(95%)' }} />
              </div>
              <h3 className="serif relative mt-6 text-2xl text-[#67232d] sm:text-3xl">Build your own blend.</h3>
              <p className="relative mx-auto mt-3 max-w-[360px] text-sm leading-[1.7] text-[#775e53]">Choose your beans, your chicory ratio and your grind — priced and roasted just for you.</p>
              <button
                type="button"
                onClick={() => navigate('/custom-roast')}
                className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-[#b83a36] px-7 py-3.5 text-xs font-semibold uppercase tracking-[.14em] text-[#fdf8f1] transition-transform hover:-translate-y-0.5"
                data-testid="button-open-custom-roast"
              >
                Build your custom roast <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <section id="b2b" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">Bulk ordering</p>
              <h2 className="serif mt-4 text-4xl leading-tight text-[#67232d] sm:text-5xl">B2B coffee supply for thoughtful teams.</h2>
              <p className="mt-6 text-sm leading-[1.8] text-[#775e53]">From offices to cafés and neighborhood stores, we supply coffee that is consistent, flavorful and ready for daily service.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[#decdb9] bg-[#fdf8f1] p-5">
                  <span className="mono text-[10px] uppercase tracking-[.16em] text-[#9a7564]">Retail</span>
                  <p className="mt-3 text-sm font-semibold text-[#67232d]">Coffee bags and shelf-ready blends.</p>
                </div>
                <div className="rounded-[1.5rem] border border-[#decdb9] bg-[#fdf8f1] p-5">
                  <span className="mono text-[10px] uppercase tracking-[.16em] text-[#9a7564]">Horeca</span>
                  <p className="mt-3 text-sm font-semibold text-[#67232d]">Consistent daily brew for service teams.</p>
                </div>
              </div>
              <button type="button" onClick={() => window.alert('Bulk order request opened.')} className="mt-8 flex items-center gap-2 rounded-full bg-[#67232d] px-6 py-3 text-xs font-semibold uppercase tracking-[.14em] text-[#f9e7c5]" data-testid="button-b2b-order">Request bulk order <ArrowRight size={15} /></button>
            </div>
            <div className="rounded-[2rem] bg-[#f1e5d8] p-8 sm:p-10">
              <div className="grid gap-5">
                <div className="flex items-center justify-between border-b border-[#decdb9] pb-4">
                  <span className="text-sm font-semibold text-[#67232d]">Signature roast</span>
                  <span className="mono text-sm text-[#b83a36]">25kg</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#decdb9] pb-4">
                  <span className="text-sm font-semibold text-[#67232d]">Pure roast</span>
                  <span className="mono text-sm text-[#b83a36]">50kg</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#decdb9] pb-4">
                  <span className="text-sm font-semibold text-[#67232d]">Single origin</span>
                  <span className="mono text-sm text-[#b83a36]">Custom lot</span>
                </div>
                <div className="rounded-[1.2rem] border border-[#decdb9] bg-[#fffaf3] p-5">
                  <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Lead time</p>
                  <p className="mt-2 text-sm font-semibold text-[#67232d]">48–72 hours for regular supply.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="ritual" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div className="relative rounded-[2rem] border border-[#e2d5c1] bg-[#fdfbf6] p-8 sm:p-12">
              <div className="absolute right-7 top-7 text-[#c9a15a]"><Sparkles size={26} strokeWidth={1.4} /></div>
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">The South Indian way</p>
              <h2 className="serif mt-5 max-w-[560px] text-5xl leading-[.95] tracking-[-.04em] text-[#67232d] sm:text-7xl">Make time<br /><em>for the pour.</em></h2>
              <div className="mt-12 grid gap-5 border-t border-[#e2d5c1] pt-6 sm:grid-cols-3">
                {ritualSteps.map((step, index) => (
                  <div key={step.title}>
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs text-[#c9a15a]">0{index + 1}</span>
                      <img src={step.icon} alt="" className="h-4 w-4 opacity-50" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#67232d]">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#775e53]">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:pl-12">
              <div className="mb-7 flex gap-1 text-[#b83a36]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} fill="currentColor" />)}</div>
              <blockquote className="serif text-3xl leading-[1.2] text-[#67232d] sm:text-4xl">“It tastes like the coffee my mother made, only better because I did not have to leave home.”</blockquote>
              <p className="mono mt-7 text-[10px] uppercase tracking-[.18em] text-[#9a7564]">— Ananya, Bengaluru</p>
              <div className="mt-12 border-t border-[#decdb9] pt-6"><p className="text-sm leading-[1.7] text-[#775e53]">Not sure where to start?</p><button type="button" onClick={() => scrollTo(`#${categorySlug('Coffee Powder')}`)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#b83a36]" data-testid="button-start-signature">Start with our signatures <ArrowRight size={15} /></button></div>
            </div>
          </div>
        </section>

        <section className="pattern-bg border-y border-[#e2d5c1] bg-[#fdfbf6]" style={{ '--pattern-opacity': '.045' } as CSSProperties}>
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
            <div><p className="mono text-[10px] uppercase tracking-[.22em] text-[#67232d]">A note from the roast house</p><h2 className="serif mt-2 text-3xl text-[#67232d] sm:text-4xl">Keep the good stuff coming.</h2></div>
            <div className="flex w-full max-w-[430px] items-center border-b border-[#67232d] pb-3"><input placeholder="Your email address" className="w-full bg-transparent text-sm text-[#67232d] outline-none placeholder:text-[#856142]" aria-label="Email address" data-testid="input-newsletter" /><button type="button" onClick={() => window.alert('You are on the list. Watch your inbox for a warm cup of news.')} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.1em] text-[#67232d]" data-testid="button-newsletter">Join us <ArrowRight size={15} /></button></div>
          </div>
        </section>
      </main>

      <footer className="bg-[#f8f1e8]">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-12">
          <div><img src={logoPath} alt="Gayathri Coffee" className="h-[84px] w-auto object-contain object-left" /><p className="mt-5 max-w-[230px] text-xs leading-[1.7] text-[#775e53]">A Mysore-rooted coffee house for the everyday ritual.</p></div>
          <div><p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Explore</p><div className="mt-4 space-y-3 text-sm text-[#67232d]">{navItems.map((item) => <button type="button" key={item.href} onClick={() => scrollTo(item.href)} className="block hover:text-[#b83a36]" data-testid={`footer-link-${item.label.toLowerCase().replace(' ', '-')}`}>{item.label}</button>)}</div></div>
          <div><p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Visit</p><div className="mt-4 space-y-2 text-sm leading-relaxed text-[#67232d]"><p>Gayathri Coffee Works</p><p>Duplin Complex, Shivram­pet</p><p>Mysore — 570 001</p></div></div>
          <div><p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Say hello</p><a href="mailto:hello@gayathricoffee.in" className="mt-4 block text-sm text-[#67232d] hover:text-[#b83a36]" data-testid="link-email">hello@gayathricoffee.in</a><a href="https://www.instagram.com" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[#b83a36]" data-testid="link-instagram"><Instagram size={16} /> Instagram</a></div>
        </div>
        <div className="border-t border-[#decdb9] px-5 py-5 text-center text-[10px] uppercase tracking-[.12em] text-[#9a7564] sm:px-8 lg:px-12">© 2024 Gayathri Coffee Works · Quality is our motto</div>
      </footer>

      {createPortal(<CartDrawer items={cart} open={cartOpen} onClose={() => setCartOpen(false)} onChange={changeQuantity} onRemove={(id) => setCart((current) => current.filter((item) => item.product.id !== id))} onCheckout={() => { setCartOpen(false); navigate('/checkout'); }} />, document.body)}
      {flyingBeans.map((bean) => <FlyingBeanSprite key={bean.id} bean={bean} />)}
      {quickView ? createPortal(
        <div className="fixed inset-0 z-[160] grid place-items-center bg-[#3a161e]/45 px-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`Details for ${quickView.name}`}>
          <div className="relative grid max-h-[90vh] w-full max-w-[850px] overflow-auto rounded-[1.7rem] bg-[#f8f1e8] shadow-2xl md:grid-cols-2">
            <button type="button" onClick={() => setQuickView(null)} className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-[#f8f1e8]/85 text-[#67232d]" aria-label="Close details" data-testid="button-close-quick-view"><X size={18} /></button>
            <div className="grid min-h-[350px] place-items-center bg-white p-10">
              <img src={quickView.image} alt={`${quickView.name} coffee pack`} className="max-h-[320px] max-w-[75%] object-contain drop-shadow-[0_16px_16px_rgba(55,25,10,.14)]" />
            </div>
            <div className="flex flex-col justify-center p-8 sm:p-10">
              <p className="mono text-[10px] uppercase tracking-[.2em] text-[#b83a36]">{quickView.category} · {quickView.roast}</p>
              <h2 className="product-name mt-3 text-5xl leading-none text-[#67232d]">{quickView.name}</h2>
              <p className="mt-5 text-sm leading-[1.7] text-[#775e53]">{quickView.description}</p>
              <div className="mt-6 border-y border-[#decdb9] py-4">
                <p className="mono text-xs uppercase tracking-[.12em] text-[#9a7564]">Cup notes</p>
                <p className="mt-2 text-sm font-medium text-[#67232d]">{quickView.notes}</p>
              </div>

              <div className="mt-6">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Weight</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {packWeights.map((weight) => (
                    <button
                      key={weight.label}
                      type="button"
                      onClick={() => setSheetWeight(weight)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${sheetWeight.label === weight.label ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-quick-weight-${weight.grams}`}
                    >
                      {weight.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Grind</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {productGrindOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSheetGrind(option)}
                      className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-colors ${sheetGrind === option ? 'border-[#b83a36] bg-[#b83a36] text-[#fdf8f1]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-quick-grind-${option.startsWith('Coarse') ? 'coarse' : 'fine'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7 flex items-center justify-between gap-4">
                <span className="mono text-lg font-medium text-[#67232d]">{formatPrice(Math.round(quickView.price * sheetWeight.factor))}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    const finalPrice = Math.round(quickView.price * sheetWeight.factor);
                    const variant: Product = {
                      ...quickView,
                      id: `${quickView.id}-${sheetWeight.grams}-${sheetGrind}`,
                      name: `${quickView.name} · ${sheetWeight.label} · ${sheetGrind}`,
                      price: finalPrice,
                      weightGrams: sheetWeight.grams,
                    };
                    addToCart(variant, event.currentTarget.getBoundingClientRect());
                    setQuickView(null);
                  }}
                  className="flex items-center gap-2 rounded-full bg-[#b83a36] px-5 py-3.5 text-xs font-semibold uppercase tracking-[.1em] text-[#fdf8f1]"
                  data-testid={`button-quick-add-${quickView.id}`}
                >
                  Add to basket <Plus size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {addSheetProduct ? createPortal(
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-[#3a161e]/45 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-label={`Add ${addSheetProduct.name} to basket`}>
          <div className="sheet-in relative flex w-full max-w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-[#f8f1e8] shadow-2xl sm:max-w-[440px] sm:rounded-[1.75rem]">
            <div className="flex justify-center pb-1 pt-3 sm:hidden"><span className="h-1.5 w-12 rounded-full bg-[#decdb9]" /></div>
            <button type="button" onClick={() => setAddSheetProduct(null)} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-white/85 text-[#67232d]" aria-label="Close" data-testid="button-close-add-sheet"><X size={16} /></button>

            <div className="max-h-[68vh] overflow-auto px-6 pb-4 pt-3 sm:max-h-[62vh] sm:pt-6">
              <div className="flex items-center gap-4">
                <div className="grid size-20 shrink-0 place-items-center rounded-2xl border border-[#decdb9] bg-white p-2">
                  <img src={addSheetProduct.image} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <h3 className="product-name truncate text-xl text-[#67232d]">{addSheetProduct.name}</h3>
                  <p className="mt-0.5 text-xs text-[#9a7564]">{addSheetProduct.category} · {addSheetProduct.roast}</p>
                  <p className="mono mt-1 text-base font-semibold text-[#67232d]">{formatPrice(Math.round(addSheetProduct.price * sheetWeight.factor))}</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Weight</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {packWeights.map((weight) => (
                    <button
                      key={weight.label}
                      type="button"
                      onClick={() => setSheetWeight(weight)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${sheetWeight.label === weight.label ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-weight-${weight.grams}`}
                    >
                      {weight.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Grind</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {productGrindOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSheetGrind(option)}
                      className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-colors ${sheetGrind === option ? 'border-[#b83a36] bg-[#b83a36] text-[#fdf8f1]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-grind-${option.startsWith('Coarse') ? 'coarse' : 'fine'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-[#decdb9] bg-[#f1e5d8] px-6 py-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                onClick={(event) => {
                  const finalPrice = Math.round(addSheetProduct.price * sheetWeight.factor);
                  const variant: Product = {
                    ...addSheetProduct,
                    id: `${addSheetProduct.id}-${sheetWeight.grams}-${sheetGrind}`,
                    name: `${addSheetProduct.name} · ${sheetWeight.label} · ${sheetGrind}`,
                    price: finalPrice,
                    weightGrams: sheetWeight.grams,
                  };
                  addToCart(variant, event.currentTarget.getBoundingClientRect());
                  setAddSheetProduct(null);
                }}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-[#b83a36] px-5 py-4 text-sm font-semibold text-[#fdf8f1] transition-transform hover:-translate-y-0.5"
                data-testid="button-confirm-add-to-cart"
              >
                Add to basket <span className="mono">· {formatPrice(Math.round(addSheetProduct.price * sheetWeight.factor))}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

const heritageBestsellers = [
  { name: 'Speciality Coffee (Filter)', note: 'Our signature filter blend, brewed the traditional way.' },
  { name: 'House Blend', note: 'A balanced everyday cup, roasted in small batches.' },
  { name: 'Special Blend', note: 'A distinctive house recipe for the discerning drinker.' },
  { name: 'Specialty Coffee (Nice)', note: 'Smooth and mellow — a house favourite.' },
  { name: 'Ultra Rich Blend', note: 'Bold, full-bodied and deeply aromatic.' },
];

const heritageTestimonials = [
  { quote: 'Amazing service and spotless cleanliness — one of the best filter coffees around.', author: 'Google review' },
  { quote: 'One of the best places to enjoy a good filter coffee and some tasty snacks.', author: 'Google review' },
  { quote: 'The onion pakoda and bread pakoda were crispy, fresh, and super delicious.', author: 'Google review' },
];

function MysoreHeritageLanding() {
  return (
    <div className="min-h-[100dvh] bg-[#1a0e05] text-[#f3e6cf]">
      <div className="bg-[#c9a15a] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[.2em] text-[#241202]">
        Avail 15% off your first order — use code <span className="font-bold">COFFEELOVE</span>
      </div>

      <section className="pattern-bg relative overflow-hidden px-5 py-16 text-center sm:py-24" style={{ '--pattern-opacity': '.05', '--pattern-blend': 'soft-light' } as CSSProperties}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,161,90,.16),transparent_60%)]" />
        <div className="relative mx-auto max-w-[720px]">
          <img src={heritageLogo} alt="MHC" className="mx-auto h-28 w-28 rounded-full object-cover shadow-[0_20px_50px_rgba(0,0,0,.5)] sm:h-36 sm:w-36" />
          <p className="mono mt-8 text-[11px] uppercase tracking-[.3em] text-[#c9a15a]">A taste of Mysore's heritage</p>
          <h1 className="serif mt-4 text-4xl leading-[1.05] text-[#f8ecd4] sm:text-6xl">Experience the<br /><em className="text-[#c9a15a]">Heritage</em> of Mysore</h1>
          <p className="mx-auto mt-6 max-w-[480px] text-sm leading-[1.8] text-[#d8c2a0] sm:text-base">Authentic South Indian filter coffee, crafted with tradition since 1982.</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a href="#bestsellers" className="rounded-full bg-[#c9a15a] px-7 py-3.5 text-xs font-semibold uppercase tracking-[.14em] text-[#241202] transition-transform hover:-translate-y-0.5">View the menu</a>
            <a href="#visit" className="border-b border-[#c9a15a]/60 pb-1 text-xs font-semibold uppercase tracking-[.14em] text-[#f3e6cf]">Visit us</a>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-12">
        <div className="overflow-hidden rounded-[2rem] border border-[#c9a15a]/20">
          <img src={heroPath} alt="MHC roastery" className="h-[320px] w-full object-cover brightness-[.55] sepia-[.35] sm:h-[400px]" />
        </div>
        <div>
          <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Our story</p>
          <h2 className="serif mt-3 text-3xl leading-tight text-[#f8ecd4] sm:text-4xl">Karnataka's coffee culture, in every cup.</h2>
          <p className="mt-6 text-sm leading-[1.85] text-[#d8c2a0]">Mysore Heritage Coffee is where the Gayathri Coffee Works legacy steps into a café. Since 1950, Mr. DC Varadaraja Setty's hand-roasted, stone-ground coffee has carried the soul of Karnataka's finest estates — a promise his successor, Mr. DV Ravikumar, has carried forward since 1982.</p>
          <p className="mt-4 text-sm leading-[1.85] text-[#d8c2a0]">Inspired by the timeless coffee traditions of Mysuru, we bring together estate-grown beans from Coorg and Chikmagalur, traditional brass-filter brewing, and warm hospitality — served the way it's always been, in a davara and tumbler.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="animate-rise text-center">
          <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">From seed to cup</p>
          <h2 className="serif mt-3 text-3xl text-[#f8ecd4] sm:text-4xl">A journey through time.</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-sm leading-[1.8] text-[#d8c2a0]">From a bicycle delivery round in 1950 to the café you're standing in today — the full legacy, in one frame.</p>
        </div>
        <div className="animate-rise mt-10 overflow-hidden rounded-[1.5rem] border border-[#c9a15a]/25 shadow-[0_30px_80px_rgba(0,0,0,.45)]">
          <img src={heritageTimeline} alt="The Gayathri Coffee legacy: a journey through time, from 1950 to MHC" className="w-full" loading="lazy" />
        </div>
      </section>

      <section className="border-y border-[#c9a15a]/15 bg-[#150a02]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-16 sm:grid-cols-2 sm:px-8 sm:py-20 lg:px-12">
          <div className="rounded-[1.5rem] border border-[#c9a15a]/20 bg-[#1a0e05] p-8">
            <Coffee size={28} className="text-[#c9a15a]" strokeWidth={1.4} />
            <h3 className="serif mt-4 text-2xl text-[#f8ecd4]">Sourced with care</h3>
            <p className="mt-3 text-sm leading-[1.8] text-[#d8c2a0]">We celebrate this legacy by serving carefully selected Arabica and Robusta coffee beans sourced from the renowned plantations of Coorg and Chikkamagaluru.</p>
          </div>
          <div className="rounded-[1.5rem] border border-[#c9a15a]/20 bg-[#1a0e05] p-8">
            <Sparkles size={28} className="text-[#c9a15a]" strokeWidth={1.4} />
            <h3 className="serif mt-4 text-2xl text-[#f8ecd4]">Traditionally brewed</h3>
            <p className="mt-3 text-sm leading-[1.8] text-[#d8c2a0]">Every cup is freshly brewed using the traditional South Indian filter method, delivering a rich aroma, smooth texture, and bold flavor.</p>
          </div>
        </div>
      </section>

      <section id="bestsellers" className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="text-center">
          <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">The menu</p>
          <h2 className="serif mt-3 text-3xl text-[#f8ecd4] sm:text-4xl">Our bestsellers</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {heritageBestsellers.map((item) => (
            <div key={item.name} className="group rounded-[1.3rem] border border-[#c9a15a]/20 bg-[#150a02] p-6 transition-colors hover:border-[#c9a15a]/50">
              <div className="grid size-11 place-items-center rounded-full bg-[#c9a15a]/10 text-[#c9a15a]"><Coffee size={20} /></div>
              <h3 className="product-name mt-4 text-lg text-[#f8ecd4]">{item.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#b39e7d]">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#c9a15a]/15 bg-[#150a02]">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="text-center">
            <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">What people say</p>
            <h2 className="serif mt-3 text-3xl text-[#f8ecd4] sm:text-4xl">Loved by regulars.</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {heritageTestimonials.map((testimonial) => (
              <div key={testimonial.quote} className="rounded-[1.3rem] border border-[#c9a15a]/20 bg-[#1a0e05] p-6">
                <div className="flex gap-1 text-[#c9a15a]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={13} fill="currentColor" />)}</div>
                <p className="mt-4 text-sm leading-[1.7] text-[#d8c2a0]">"{testimonial.quote}"</p>
                <p className="mono mt-4 text-[10px] uppercase tracking-[.16em] text-[#b39e7d]">— {testimonial.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="franchise" className="border-y border-[#c9a15a]/15 bg-[#150a02]">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Franchise</p>
              <h2 className="serif mt-4 text-3xl leading-tight text-[#f8ecd4] sm:text-4xl">Build a neighborhood coffee story.</h2>
              <p className="mt-6 text-sm leading-[1.8] text-[#d8c2a0]">Our franchise model brings a warm and focused coffee-house experience to high-energy city neighborhoods and family-led markets.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="rounded-full border border-[#c9a15a]/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#c9a15a]">Roast support</span>
                <span className="rounded-full border border-[#c9a15a]/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#c9a15a]">Menu design</span>
                <span className="rounded-full border border-[#c9a15a]/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#c9a15a]">Retail training</span>
              </div>
            </div>
            <div className="rounded-[2rem] border border-[#c9a15a]/20 bg-[#1a0e05] p-8 sm:p-10">
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-[#c9a15a]/20 pb-4">
                  <span className="text-sm font-semibold uppercase tracking-[.14em] text-[#f3e6cf]">Brand system</span>
                  <Check size={18} className="text-[#c9a15a]" />
                </div>
                <div className="flex items-center justify-between border-b border-[#c9a15a]/20 pb-4">
                  <span className="text-sm font-semibold uppercase tracking-[.14em] text-[#f3e6cf]">Coffee operations</span>
                  <Check size={18} className="text-[#c9a15a]" />
                </div>
                <div className="flex items-center justify-between border-b border-[#c9a15a]/20 pb-4">
                  <span className="text-sm font-semibold uppercase tracking-[.14em] text-[#f3e6cf]">Store growth</span>
                  <Check size={18} className="text-[#c9a15a]" />
                </div>
                <a href="#visit" className="mt-4 rounded-full bg-[#c9a15a] px-5 py-3 text-center text-xs font-semibold uppercase tracking-[.14em] text-[#241202] transition-colors hover:bg-[#d9b370]" data-testid="button-franchise-plan">Plan a franchise</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="visit" className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="grid gap-8 rounded-[2rem] border border-[#c9a15a]/20 bg-[#150a02] p-8 sm:grid-cols-3 sm:p-12">
          <div>
            <MapPin size={22} className="text-[#c9a15a]" />
            <p className="mt-3 text-sm leading-[1.7] text-[#d8c2a0]">#1066, Near Hotel Airlines, Jayalakshmi Vilas Road, Chamarajpurum (Lakshmipurum), Mysore – 570005</p>
          </div>
          <div>
            <Phone size={22} className="text-[#c9a15a]" />
            <a href="tel:9606950300" className="mt-3 block text-sm text-[#d8c2a0] hover:text-[#c9a15a]">9606950300</a>
          </div>
          <div>
            <Mail size={22} className="text-[#c9a15a]" />
            <a href="mailto:reachus@gayathricoffee.com" className="mt-3 block text-sm text-[#d8c2a0] hover:text-[#c9a15a]">reachus@gayathricoffee.com</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#c9a15a]/15 py-8 text-center">
        <p className="mono text-[10px] uppercase tracking-[.2em] text-[#8a765a]">MHC · Taste of Heritage</p>
      </footer>
    </div>
  );
}

function BrandToggle({
  isHeritage,
  onToggle,
}: {
  isHeritage: boolean;
  onToggle: (originX: string, originY: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onToggle(`${rect.left + rect.width / 2}px`, `${rect.top + rect.height / 2}px`);
      }}
      aria-label={`Switch to ${isHeritage ? 'Gayathri Coffee' : 'MHC'}`}
      data-testid="button-brand-toggle"
      className={`fixed bottom-5 left-4 z-[150] flex items-center rounded-full border p-1 shadow-[0_10px_30px_rgba(0,0,0,.25)] backdrop-blur-md transition-colors duration-500 sm:bottom-6 sm:left-6 ${isHeritage ? 'border-[#c9a15a]/40 bg-[#1a0e05]/95' : 'border-[#e2d5c1] bg-white/95'}`}
    >
      <span className={`absolute inset-y-1 w-[calc(50%-2px)] rounded-full transition-all duration-500 ${isHeritage ? 'left-[calc(50%+1px)] bg-gradient-to-r from-[#c9a15a] to-[#e0b872]' : 'left-1 bg-[#67232d]'}`} />
      <span className={`relative z-10 flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-[9px] font-semibold uppercase tracking-wide transition-colors sm:text-[10px] ${!isHeritage ? 'text-white' : 'text-[#d8c2a0]/70'}`}>
        <img src={logoPath} alt="" className="size-5 rounded-full bg-white object-contain p-0.5" /> Gayathri
      </span>
      <span className={`relative z-10 flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[9px] font-semibold uppercase tracking-wide transition-colors sm:text-[10px] ${isHeritage ? 'text-[#241202]' : 'text-[#9a7564]'}`}>
        MHC <img src={heritageLogo} alt="" className="size-5 rounded-full object-cover" />
      </span>
    </button>
  );
}

function BrandExperience() {
  const [brand, setBrand] = useState<'gayathri' | 'heritage'>('gayathri');
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>('idle');
  const [origin, setOrigin] = useState({ x: '100%', y: '0%' });
  const [overlayColor, setOverlayColor] = useState('#1a0e05');
  const isHeritage = brand === 'heritage';

  const handleToggle = (originX: string, originY: string) => {
    if (phase !== 'idle') return;
    setOrigin({ x: originX, y: originY });
    const next = isHeritage ? 'gayathri' : 'heritage';
    setOverlayColor(next === 'heritage' ? '#1a0e05' : '#f8f1e8');
    setPhase('in');
    window.setTimeout(() => {
      setBrand(next);
      window.scrollTo(0, 0);
      setPhase('out');
    }, 520);
    window.setTimeout(() => setPhase('idle'), 1040);
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[200] transition-[clip-path] duration-500 ease-[cubic-bezier(.65,0,.35,1)]"
        style={{
          backgroundColor: overlayColor,
          clipPath: phase === 'in' ? `circle(150% at ${origin.x} ${origin.y})` : `circle(0% at ${origin.x} ${origin.y})`,
        }}
      />
      <BrandToggle isHeritage={isHeritage} onToggle={handleToggle} />
      <div key={brand} className="animate-rise">
        {isHeritage ? <MysoreHeritageLanding /> : <Storefront onSwitchBrand={handleToggle} />}
      </div>
    </>
  );
}

type CoffeeTypeOption = 'Arabica' | 'Robusta' | 'Peaberry' | 'Mysore Nuggets';
const coffeeTypeOptions: CoffeeTypeOption[] = ['Arabica', 'Robusta', 'Peaberry', 'Mysore Nuggets'];
const coffeeTypePricePerKg: Record<CoffeeTypeOption, number> = { Arabica: 420, Robusta: 285, Peaberry: 315, 'Mysore Nuggets': 460 };
const chicoryPricePerKg = 90;

type GrindOption = 'Coarse' | 'Medium' | 'Fine' | 'Roasted Beans';
const grindOptions: GrindOption[] = ['Coarse', 'Medium', 'Fine', 'Roasted Beans'];
const grindGuide: Record<GrindOption, { note: string; methods: { label: string; icon: string }[] }> = {
  Coarse: {
    note: 'Chunky grounds slow the drip, giving the thick, strong decoction a traditional davara-tumbler needs.',
    methods: [
      { label: 'South Indian filter', icon: '/icons/brew-filter.svg' },
      { label: 'French press', icon: '/icons/brew-french-press.svg' },
      { label: 'Cold brew', icon: '/icons/brew-cold-brew.svg' },
    ],
  },
  Medium: {
    note: 'A balanced, sand-like grind for a clean, even extraction in everyday filter machines.',
    methods: [
      { label: 'Drip machine', icon: '/icons/brew-drip-machine.svg' },
      { label: 'Pour-over', icon: '/icons/brew-pour-over.svg' },
      { label: 'Chemex', icon: '/icons/brew-chemex.svg' },
    ],
  },
  Fine: {
    note: 'Densely packed fine grounds hold back pressure for a concentrated, syrupy shot.',
    methods: [
      { label: 'Espresso', icon: '/icons/brew-espresso.svg' },
      { label: 'Moka pot', icon: '/icons/brew-moka-pot.svg' },
      { label: 'Percolator', icon: '/icons/brew-percolator.svg' },
    ],
  },
  'Roasted Beans': {
    note: 'Whole beans stay fresher longer — grind them yourself right before brewing, any method you like.',
    methods: [{ label: 'Your own grinder', icon: '/icons/grind-whole.svg' }],
  },
};

function CustomRoastPage() {
  const [, navigate] = useLocation();
  const { setCart } = useCart();
  const [type1, setType1] = useState<CoffeeTypeOption>('Arabica');
  const [type2, setType2] = useState<CoffeeTypeOption>('Robusta');
  const [blend1, setBlend1] = useState(80);
  const [blend2, setBlend2] = useState(20);
  const [blend3, setBlend3] = useState(0);
  const [grind, setGrind] = useState<GrindOption>('Medium');
  const [tick, setTick] = useState(0);
  const [added, setAdded] = useState(false);
  const addedTimeout = useRef<number | undefined>(undefined);
  const blend1Ref = useRef<HTMLInputElement>(null);
  const blend2Ref = useRef<HTMLInputElement>(null);
  const blend3Ref = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(addedTimeout.current), []);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // React's controlled `value` can lag a render behind on a range input when
  // it's updated as a side effect of a sibling slider's native event — force
  // the live DOM value to stay in sync with state.
  useEffect(() => { if (blend1Ref.current) blend1Ref.current.value = String(blend1); }, [blend1]);
  useEffect(() => { if (blend2Ref.current) blend2Ref.current.value = String(blend2); }, [blend2]);
  useEffect(() => { if (blend3Ref.current) blend3Ref.current.value = String(blend3); }, [blend3]);

  const bump = () => setTick((t) => t + 1);

  const CHICORY_STEP = 10;
  // Coffee 1/2 step at 5 (half of Chicory's step) so that carving an equal
  // amount out of both for a 10% Chicory move always lands on a value the
  // <input type="range" step="..."> will actually accept — a browser
  // silently ignores a programmatic .value set that isn't step-aligned.
  const COFFEE_STEP = 5;
  const CHICORY_MAX = 50;
  const roundToStep = (value: number, step: number) => Math.round(value / step) * step;

  // Blend 1 and Blend 2 directly compensate each other — their combined
  // share (pairSum) only moves when Blend 3 changes.
  const changeBlend1 = (next: number) => {
    const pairSum = blend1 + blend2;
    const clamped = Math.min(Math.max(roundToStep(next, COFFEE_STEP), 0), pairSum);
    setBlend1(clamped);
    setBlend2(pairSum - clamped);
    bump();
  };

  const changeBlend2 = (next: number) => {
    const pairSum = blend1 + blend2;
    const clamped = Math.min(Math.max(roundToStep(next, COFFEE_STEP), 0), pairSum);
    setBlend2(clamped);
    setBlend1(pairSum - clamped);
    bump();
  };

  // Blend 3 (chicory, capped at 50%) always comes out of — or back into —
  // Blend 1 and Blend 2 in equal amounts, split evenly between them.
  const changeBlend3 = (next: number) => {
    const clamped = Math.min(Math.max(roundToStep(next, CHICORY_STEP), 0), CHICORY_MAX);
    const delta = clamped - blend3;
    let newBlend1 = blend1 - delta / 2;
    let newBlend2 = blend2 - delta / 2;
    // If one side runs out, the rest of the change spills onto the other
    // so Blend 1 + Blend 2 + Blend 3 keeps summing to 100.
    if (newBlend1 < 0) { newBlend2 += newBlend1; newBlend1 = 0; }
    if (newBlend2 < 0) { newBlend1 += newBlend2; newBlend2 = 0; }
    setBlend3(clamped);
    setBlend1(Math.max(0, newBlend1));
    setBlend2(Math.max(0, newBlend2));
    // Roasted (whole) beans can't carry chicory — fall back to a real grind.
    if (clamped > 0 && grind === 'Roasted Beans') setGrind('Medium');
    bump();
  };

  const totalPrice = Math.round(
    (blend1 / 100) * coffeeTypePricePerKg[type1] +
      (blend2 / 100) * coffeeTypePricePerKg[type2] +
      (blend3 / 100) * chicoryPricePerKg,
  );

  const handleAddToCart = () => {
    const id = `custom-${type1}-${type2}-${blend1}-${blend3}-${grind}`.toLowerCase().replace(/\s+/g, '-');
    const product: Product = {
      id,
      name: `Custom Blend · ${blend1}% ${type1} / ${blend2}% ${type2}`,
      shortName: 'Custom Blend',
      description: `${blend3}% chicory · ${grind} grind`,
      price: totalPrice,
      weightGrams: 1000,
      category: 'Custom Blend',
      roast: grind,
      notes: `${blend1}% ${type1} · ${blend2}% ${type2} · ${blend3}% Chicory`,
      image: coffeeMockup,
    };
    setCart((current) => {
      const existing = current.find((item) => item.product.id === id);
      return existing
        ? current.map((item) => (item.product.id === id ? { ...item, quantity: item.quantity + 1 } : item))
        : [...current, { product, quantity: 1 }];
    });
    setAdded(true);
    window.clearTimeout(addedTimeout.current);
    addedTimeout.current = window.setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="min-h-[100dvh] bg-[#fdf8f1] text-[#67232d]">
      <header className="sticky top-0 z-30 border-b border-[#decdb9] bg-[#fdf8f1]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#775e53] transition-colors hover:text-[#b83a36]" data-testid="button-back-home">
            <ArrowRight size={14} className="rotate-180" /> Back to shop
          </button>
          <img src={logoPath} alt="Gayathri Coffee" className="h-10 w-auto object-contain" />
          <div className="w-[92px]" />
        </div>
      </header>

      <section className="pattern-bg relative overflow-hidden px-5 py-14 text-center sm:py-20" style={{ '--pattern-opacity': '.05' } as CSSProperties}>
        <p className="mono text-[10px] uppercase tracking-[.3em] text-[#c9a15a]">Roasted to your taste</p>
        <h1 className="serif mt-4 text-4xl leading-[1.05] text-[#67232d] sm:text-6xl">Build your <em className="text-[#b83a36]">custom roast.</em></h1>
        <p className="mx-auto mt-5 max-w-[520px] text-sm leading-[1.8] text-[#775e53] sm:text-base">Blend two coffee types, dial in your chicory, choose your grind — and we will roast it just for you.</p>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Coffee Type 1</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {coffeeTypeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => { setType1(option); bump(); }}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${type1 === option ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-type1-${option.toLowerCase().replace(' ', '-')}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6">
                <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Coffee Type 2</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {coffeeTypeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => { setType2(option); bump(); }}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${type2 === option ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-type2-${option.toLowerCase().replace(' ', '-')}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Your blend</p>
              <p className="mt-1 text-xs text-[#9a7564]">All three always add up to 100%. Move {type1} or {type2} and the other compensates; move Chicory (up to 50%, in steps of 10%) and equal amounts are added to or taken from both.</p>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#67232d]">{type1}</span>
                  <span className="mono text-xs text-[#67232d]">{blend1}%</span>
                </div>
                <input
                  ref={blend1Ref}
                  type="range"
                  min={0}
                  max={100}
                  step={COFFEE_STEP}
                  value={blend1}
                  onChange={(event) => changeBlend1(Number(event.target.value))}
                  className="bean-slider mt-2 w-full"
                  style={{ '--fill': `${blend1}%`, '--fill-color': '#67232d' } as CSSProperties}
                  aria-label={`${type1} percentage`}
                  data-testid="slider-blend-1"
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#67232d]">{type2}</span>
                  <span className="mono text-xs text-[#67232d]">{blend2}%</span>
                </div>
                <input
                  ref={blend2Ref}
                  type="range"
                  min={0}
                  max={100}
                  step={COFFEE_STEP}
                  value={blend2}
                  onChange={(event) => changeBlend2(Number(event.target.value))}
                  className="bean-slider mt-2 w-full"
                  style={{ '--fill': `${blend2}%`, '--fill-color': '#b83a36' } as CSSProperties}
                  aria-label={`${type2} percentage`}
                  data-testid="slider-blend-2"
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#67232d]">Chicory</span>
                  <span className="mono text-xs text-[#67232d]">{blend3}%</span>
                </div>
                <div className="relative mt-2">
                  <input
                    ref={blend3Ref}
                    type="range"
                    min={0}
                    max={CHICORY_MAX}
                    step={10}
                    value={blend3}
                    onChange={(event) => changeBlend3(Number(event.target.value))}
                    className="bean-slider w-full"
                    style={{ '--fill': `${(blend3 / CHICORY_MAX) * 100}%`, '--fill-color': '#c9a15a' } as CSSProperties}
                    aria-label="Chicory percentage"
                    data-testid="slider-blend-3"
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-[14px]">
                    {[0, 10, 20, 30, 40, 50].map((milestone) => (
                      <span
                        key={milestone}
                        className="h-2.5 w-px bg-[#fdf8f1]/80"
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-between px-1 text-[10px] text-[#9a7564]">
                    {[0, 10, 20, 30, 40, 50].map((milestone) => (
                      <span key={milestone} className="mono">{milestone}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex h-2.5 overflow-hidden rounded-full border border-[#decdb9]">
                <div className="h-full bg-[#67232d] transition-[width] duration-200" style={{ width: `${blend1}%` }} />
                <div className="h-full bg-[#b83a36] transition-[width] duration-200" style={{ width: `${blend2}%` }} />
                <div className="h-full bg-[#c9a15a] transition-[width] duration-200" style={{ width: `${blend3}%` }} />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Grinding</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {grindOptions.map((option) => {
                  const disabled = option === 'Roasted Beans' && blend3 > 0;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled}
                      onClick={() => { setGrind(option); bump(); }}
                      className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-colors ${disabled ? 'cursor-not-allowed border-[#decdb9] text-[#c3ab93] opacity-50' : grind === option ? 'border-[#b83a36] bg-[#b83a36] text-[#fdf8f1]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                      data-testid={`button-grind-${option.toLowerCase().replace(' ', '-')}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {blend3 > 0 ? <p className="mt-2 text-xs text-[#9a7564]">Whole (roasted) beans aren't available with chicory blended in — it has to be ground.</p> : null}
              <div key={grind} className="sheet-in mt-4 rounded-xl border border-[#c9a15a]/40 bg-[#fdf8f1] px-4 py-4" data-testid="text-grind-guide">
                <p className="text-xs font-semibold text-[#67232d]">Best for</p>
                <p className="mt-1 text-xs leading-relaxed text-[#775e53]">{grindGuide[grind].note}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {grindGuide[grind].methods.map((method) => (
                    <div key={method.label} className="flex w-[88px] flex-col items-center gap-1.5 rounded-lg border border-[#decdb9] bg-white px-2 py-2.5 text-center">
                      <img src={method.icon} alt="" className="h-8 w-8 object-contain" />
                      <span className="text-[10px] font-medium leading-tight text-[#67232d]">{method.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-[#9a7564]">These brewing method suggestions are for general knowledge only. We don't recommend a specific grind size for any particular brew method — the right grind depends entirely on your own taste and equipment.</p>
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-24">
            <div className="rounded-[2rem] bg-[#67232d] p-8 text-[#f9e7c5] shadow-[0_24px_60px_rgba(86,27,35,.25)] sm:p-10">
              <div className="relative mx-auto mb-6 h-[150px] w-full max-w-[220px] overflow-hidden rounded-[1.25rem] border border-[#c9a15a]/25 bg-[#1a0e05]">
                <div className="absolute inset-x-0 top-2 grid place-items-center"><BeanBounceLottie playKey={tick} /></div>
              </div>
              <p className="mono text-[10px] uppercase tracking-[.2em] text-[#c9a15a]">Your blend</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm font-semibold text-[#f9e7c5]"><span>{type1}</span><span>{blend1}%</span></div>
                <div className="flex justify-between text-sm font-semibold text-[#f9e7c5]"><span>{type2}</span><span>{blend2}%</span></div>
                <div className="flex justify-between text-sm font-semibold text-[#f9e7c5]"><span>Chicory</span><span>{blend3}%</span></div>
              </div>
              <div className="mt-4 space-y-2 border-t border-[#f9e7c5]/20 pt-4 text-xs text-[#d9bfa9]">
                <div className="flex justify-between"><span>Grind</span><span className="text-[#f9e7c5]">{grind}</span></div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-[#f9e7c5]/20 pt-5">
                <span className="text-sm font-semibold uppercase tracking-[.14em]">Total price</span>
                <span className="serif text-3xl">{formatPrice(totalPrice)}</span>
              </div>
              <p className="mt-1 text-[10px] text-[#d9bfa9]/70">Per KG · placeholder pricing</p>
              <button
                type="button"
                onClick={handleAddToCart}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-semibold uppercase tracking-[.12em] transition-colors ${added ? 'bg-[#3f8f5f] text-white' : 'bg-[#c9a15a] text-[#241202] hover:bg-[#d9b370]'}`}
                data-testid="button-add-custom-to-cart"
              >
                {added ? <>Added to cart <Check size={16} /></> : <>Add to cart <ShoppingBag size={16} /></>}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

type ShippingMethod = 'shiprocket' | 'india_post';
const SHIPROCKET_ESTIMATE_FEE = 49;

function lookupIndiaPostFee(totalWeightGrams: number, table: { weightGrams: number; price: number }[]): number {
  if (table.length === 0) return 60;
  const weight = Math.max(totalWeightGrams, 1);
  const sorted = [...table].sort((a, b) => a.weightGrams - b.weightGrams);
  const tier = sorted.find((t) => t.weightGrams >= weight);
  return tier ? tier.price : sorted[sorted.length - 1].price;
}

type RazorpayHandlerResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void };
declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      order_id: string;
      prefill: { name: string; contact: string; email: string };
      theme: { color: string };
      handler: (response: RazorpayHandlerResponse) => void;
      modal: { ondismiss: () => void };
    }) => RazorpayInstance;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function CheckoutPage() {
  const [, navigate] = useLocation();
  const { cart, setCart } = useCart();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPincode, setBillingPincode] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('shiprocket');
  // No COD — every order pays online through Razorpay.
  const payment = 'Online';
  const [placed, setPlaced] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [orderTotal, setOrderTotal] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const { data: shippingSettings } = useGetShippingSettings();
  const indiaPostRateTable = shippingSettings?.indiaPostRateTable ?? [];

  const { data: paymentSettings } = useGetPaymentSettings();
  const razorpayEnabled = Boolean(paymentSettings?.razorpayEnabled && paymentSettings.keyId);
  const createRazorpayOrder = useCreateRazorpayOrder();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalWeightGrams = cart.reduce((sum, item) => sum + item.product.weightGrams * item.quantity, 0);
  const pincodeValid = /^\d{6}$/.test(pincode.trim());

  const indiaPostRateParams = { pincode: pincode.trim(), weightGrams: totalWeightGrams };
  const { data: liveIndiaPostRate, isFetching: indiaPostRateLoading } = useGetIndiaPostRate(indiaPostRateParams, {
    query: { enabled: pincodeValid && totalWeightGrams > 0, queryKey: getGetIndiaPostRateQueryKey(indiaPostRateParams) },
  });
  const indiaPostFee = liveIndiaPostRate?.amount ?? lookupIndiaPostFee(totalWeightGrams, indiaPostRateTable);

  const shiprocketRateParams = { pincode: pincode.trim(), weightGrams: totalWeightGrams, cod: false };
  const { data: liveShiprocketRate, isFetching: shiprocketRateLoading } = useGetShiprocketRate(shiprocketRateParams, {
    query: { enabled: pincodeValid && totalWeightGrams > 0, queryKey: getGetShiprocketRateQueryKey(shiprocketRateParams) },
  });
  const shiprocketFee = liveShiprocketRate?.amount ?? SHIPROCKET_ESTIMATE_FEE;

  const deliveryFee = shippingMethod === 'india_post' ? indiaPostFee : shiprocketFee;
  const total = subtotal + deliveryFee;

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (order) => {
        setOrderId(order.orderNumber);
        setOrderTotal(order.total);
        setCustomerName(fullName.trim());
        setPlaced(true);
        setCart([]);
      },
      onError: (err) => setPlaceError(err instanceof Error ? err.message : 'Could not place your order. Please try again.'),
    },
  });

  const buildOrderPayload = (verification?: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) => ({
    customerName: fullName.trim(),
    phone: phone.trim(),
    email: email.trim() || null,
    address: address.trim(),
    city: city.trim(),
    state: state || null,
    pincode: pincode.trim(),
    billingAddress: billingSameAsShipping ? null : billingAddress.trim(),
    billingCity: billingSameAsShipping ? null : billingCity.trim(),
    billingState: billingSameAsShipping ? null : billingState || null,
    billingPincode: billingSameAsShipping ? null : billingPincode.trim(),
    notes: notes.trim() || null,
    subtotal,
    shippingMethod,
    shippingFee: deliveryFee,
    total,
    paymentMethod: payment,
    ...verification,
    items: cart.map((item) => ({
      productVariantId: null,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
    })),
  });

  const handlePlaceOrder = async () => {
    const missing: string[] = [];
    if (!fullName.trim()) missing.push('Full name');
    if (!phone.trim() || phone.trim().length < 10) missing.push('a valid phone number');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) missing.push('a valid email address');
    if (!address.trim()) missing.push('delivery address');
    if (!city.trim()) missing.push('city');
    if (!state) missing.push('state');
    if (!pincode.trim() || pincode.trim().length < 6) missing.push('a valid pincode');
    if (!billingSameAsShipping) {
      if (!billingAddress.trim()) missing.push('billing address');
      if (!billingCity.trim()) missing.push('billing city');
      if (!billingState) missing.push('billing state');
      if (!billingPincode.trim() || billingPincode.trim().length < 6) missing.push('a valid billing pincode');
    }
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    setPlaceError(null);

    if (!razorpayEnabled) {
      createOrder.mutate({ data: buildOrderPayload() });
      return;
    }

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay || !paymentSettings?.keyId) {
        setPlaceError('Could not load the payment gateway. Please try again.');
        return;
      }
      const { razorpayOrderId } = await createRazorpayOrder.mutateAsync({ data: { amount: total } });
      const rzp = new window.Razorpay({
        key: paymentSettings.keyId,
        amount: Math.round(total * 100),
        currency: 'INR',
        name: 'Gayathri Coffee',
        order_id: razorpayOrderId,
        prefill: { name: fullName.trim(), contact: phone.trim(), email: email.trim() },
        theme: { color: '#67232d' },
        handler: (response) => {
          createOrder.mutate({
            data: buildOrderPayload({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });
        },
        modal: { ondismiss: () => setPlaceError('Payment was cancelled.') },
      });
      rzp.open();
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not start the payment. Please try again.');
    }
  };

  if (cart.length === 0 && !placed) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fdf8f1] px-6 text-center text-[#67232d]">
        <div>
          <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full bg-[#c9a15a] text-[#67232d]"><Coffee size={30} /></div>
          <h1 className="serif text-3xl">Your basket is empty.</h1>
          <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-[#775e53]">Add a bag of something good before you check out.</p>
          <button type="button" onClick={() => navigate('/')} className="mt-6 rounded-full bg-[#67232d] px-6 py-3 text-xs font-semibold uppercase tracking-[.14em] text-[#f9e7c5]" data-testid="button-empty-checkout-shop">Browse the coffee</button>
        </div>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fdf8f1] px-6 text-center text-[#67232d]">
        <div className="max-w-[420px]">
          <div className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-[#3f8f5f] text-white"><Check size={34} /></div>
          <h1 className="serif text-4xl">Order placed!</h1>
          <p className="mt-3 text-sm leading-[1.7] text-[#775e53]">Thank you, {customerName.split(' ')[0]}. Your coffee is being roasted and packed.</p>
          <div className="mt-6 rounded-[1.5rem] border border-[#decdb9] bg-white p-6 text-left">
            <div className="flex justify-between text-sm"><span className="text-[#775e53]">Order ID</span><span className="mono font-semibold text-[#67232d]">{orderId}</span></div>
            <div className="mt-2 flex justify-between text-sm"><span className="text-[#775e53]">Shipping via</span><span className="font-medium text-[#67232d]">{shippingMethod === 'shiprocket' ? 'Shiprocket' : 'India Post'}</span></div>
            <div className="mt-2 flex justify-between text-sm"><span className="text-[#775e53]">Payment</span><span className="font-medium text-[#67232d]">{payment}</span></div>
            <div className="mt-2 flex justify-between text-sm"><span className="text-[#775e53]">Total paid</span><span className="mono font-semibold text-[#67232d]">{formatPrice(orderTotal)}</span></div>
            <div className="mt-2 flex justify-between text-sm"><span className="text-[#775e53]">Estimated delivery</span><span className="font-medium text-[#67232d]">{shippingMethod === 'shiprocket' ? '2-4 business days' : '5-8 business days'}</span></div>
          </div>
          <button type="button" onClick={() => navigate('/')} className="mt-8 w-full rounded-full bg-[#67232d] px-6 py-4 text-sm font-semibold uppercase tracking-[.12em] text-[#f9e7c5]" data-testid="button-continue-shopping">Continue shopping</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#fdf8f1] text-[#67232d]">
      <header className="sticky top-0 z-30 border-b border-[#decdb9] bg-[#fdf8f1]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-4 sm:px-8">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#775e53] transition-colors hover:text-[#b83a36]" data-testid="button-back-to-shop">
            <ArrowRight size={14} className="rotate-180" /> Back to shop
          </button>
          <img src={logoPath} alt="Gayathri Coffee" className="h-10 w-auto object-contain" />
          <div className="w-[92px]" />
        </div>
      </header>

      <section className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 lg:px-12">
        <p className="mono text-[10px] uppercase tracking-[.22em] text-[#c9a15a]">Checkout</p>
        <h1 className="serif mt-2 text-3xl text-[#67232d] sm:text-4xl">Almost there.</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Delivery details</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Full name</span>
                  <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-name" />
                </label>
                <label className="block">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Phone</span>
                  <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit mobile" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-phone" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Email</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-email" />
                </label>
                <label className="block">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Pincode</span>
                  <input type="text" value={pincode} onChange={(event) => setPincode(event.target.value)} placeholder="560001" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-pincode" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Address</span>
                  <textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House no, street, landmark" className="mt-2 min-h-[76px] w-full border border-[#decdb9] bg-transparent p-3 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-address" />
                </label>
                <label className="block">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">City</span>
                  <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Mysore" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-city" />
                </label>
                <label className="block">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">State</span>
                  <select value={state} onChange={(event) => setState(event.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none" data-testid="select-checkout-state">
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={billingSameAsShipping}
                    onChange={(event) => setBillingSameAsShipping(event.target.checked)}
                    className="size-4 accent-[#67232d]"
                    data-testid="checkbox-billing-same-as-shipping"
                  />
                  <span className="text-sm text-[#67232d]">Billing address same as shipping address</span>
                </label>
                {!billingSameAsShipping ? (
                  <>
                    <label className="block sm:col-span-2">
                      <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Billing address</span>
                      <textarea value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} placeholder="House no, street, landmark" className="mt-2 min-h-[76px] w-full border border-[#decdb9] bg-transparent p-3 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-billing-address" />
                    </label>
                    <label className="block">
                      <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Billing city</span>
                      <input type="text" value={billingCity} onChange={(event) => setBillingCity(event.target.value)} placeholder="Mysore" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-billing-city" />
                    </label>
                    <label className="block">
                      <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Billing pincode</span>
                      <input type="text" value={billingPincode} onChange={(event) => setBillingPincode(event.target.value)} placeholder="560001" className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-billing-pincode" />
                    </label>
                    <label className="block">
                      <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Billing state</span>
                      <select value={billingState} onChange={(event) => setBillingState(event.target.value)} className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none" data-testid="select-checkout-billing-state">
                        <option value="">Select state</option>
                        {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  </>
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="mono text-[10px] uppercase tracking-[.14em] text-[#9a7564]">Delivery notes (optional)</span>
                  <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Leave with security, call on arrival..." className="mt-2 w-full border-b border-[#decdb9] bg-transparent py-2 text-sm text-[#67232d] outline-none placeholder:text-[#c3ab93]" data-testid="input-checkout-notes" />
                </label>
              </div>
              {errors.length > 0 ? (
                <div className="mt-4 rounded-xl border border-[#b83a36]/40 bg-[#b83a36]/5 px-4 py-3 text-xs text-[#b83a36]" data-testid="text-checkout-errors">
                  Please fill in: {errors.join(', ')}.
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Shipping method</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShippingMethod('shiprocket')}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${shippingMethod === 'shiprocket' ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                  data-testid="button-shipping-shiprocket"
                >
                  <span className="block text-sm font-semibold">Shiprocket</span>
                  <span className={`mt-1 block text-xs ${shippingMethod === 'shiprocket' ? 'text-[#d9bfa9]' : 'text-[#9a7564]'}`}>Standard courier · 2-4 business days</span>
                  <span className="mono mt-2 block text-sm">
                    {pincodeValid && shiprocketRateLoading ? 'Calculating…' : formatPrice(shiprocketFee)}
                  </span>
                  {!pincodeValid ? <span className={`mt-1 block text-[10px] ${shippingMethod === 'shiprocket' ? 'text-[#d9bfa9]/70' : 'text-[#9a7564]/80'}`}>Enter your pincode above for an exact rate</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => setShippingMethod('india_post')}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${shippingMethod === 'india_post' ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#c9a15a]'}`}
                  data-testid="button-shipping-india-post"
                >
                  <span className="block text-sm font-semibold">India Post</span>
                  <span className={`mt-1 block text-xs ${shippingMethod === 'india_post' ? 'text-[#d9bfa9]' : 'text-[#9a7564]'}`}>Speed Post · 5-8 business days</span>
                  <span className="mono mt-2 block text-sm">
                    {pincodeValid && indiaPostRateLoading ? 'Calculating…' : formatPrice(indiaPostFee)}
                  </span>
                  {!pincodeValid ? <span className={`mt-1 block text-[10px] ${shippingMethod === 'india_post' ? 'text-[#d9bfa9]/70' : 'text-[#9a7564]/80'}`}>Enter your pincode above for an exact rate</span> : null}
                </button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#decdb9] bg-white p-6 sm:p-8">
              <p className="mono text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Order items</p>
              <div className="mt-4 space-y-4">
                {cart.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-[#decdb9] bg-[#fdf8f1] p-1"><img src={product.image} alt="" className="max-h-full max-w-full object-contain" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#67232d]">{product.name}</p>
                      <p className="text-xs text-[#9a7564]">Qty {quantity}</p>
                    </div>
                    <span className="mono text-sm text-[#67232d]">{formatPrice(product.price * quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-24">
            <div className="rounded-[2rem] bg-[#67232d] p-7 text-[#f9e7c5] shadow-[0_24px_60px_rgba(86,27,35,.25)] sm:p-9">
              <p className="mono text-[10px] uppercase tracking-[.2em] text-[#c9a15a]">Order summary</p>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-[#d9bfa9]">Subtotal</span><span className="mono">{formatPrice(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-[#d9bfa9]">Delivery</span><span className="mono">{deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}</span></div>
              </div>
              <p className="mt-3 text-[10px] text-[#d9bfa9]/70">Hand-roasted in Mysore and shipped across India — delivery is calculated above based on your pincode.</p>
              <div className="mt-5 flex items-center justify-between border-t border-[#f9e7c5]/20 pt-5">
                <span className="text-sm font-semibold uppercase tracking-[.14em]">Total</span>
                <span className="serif text-3xl">{formatPrice(total)}</span>
              </div>
              {placeError ? <p className="mt-3 text-center text-xs text-[#f2b8ae]" data-testid="text-place-order-error">{placeError}</p> : null}
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={createOrder.isPending}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a15a] px-5 py-4 text-sm font-semibold uppercase tracking-[.12em] text-[#241202] transition-colors hover:bg-[#d9b370] disabled:opacity-60"
                data-testid="button-place-order"
              >
                {createOrder.isPending || createRazorpayOrder.isPending ? 'Placing order…' : 'Place order'} <ArrowRight size={16} />
              </button>
              {!razorpayEnabled ? (
                <p className="mt-3 text-center text-[10px] text-[#d9bfa9]/60">Payment is simulated — no real charge will be made.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={BrandExperience} />
        <Route path="/custom-roast" component={CustomRoastPage} />
        <Route path="/checkout" component={CheckoutPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={BrandExperience} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </CartProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;