import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coffee,
  Heart,
  Instagram,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import logoPath from '@assets/Gayathri_Coffee_Logo_1789394897707.png';
import heroPath from '@assets/Gemini_Generated_Image_utzyskutzyskutzy_1789394897703.png';
import robustaPath from '@assets/gcw-products-robusta-aa_1789394897705.png';
import pureAPath from '@assets/gcw-products-pure-a_1789394897705.png';
import purePBPath from '@assets/gcw-products-pure-pb_1789394897705.png';
import arabicaPath from '@assets/gcw-products-arabica-aa_1789394897706.png';
import nuggetsPath from '@assets/gcw-products-mysore-nuggets_1789394897706.png';

type Product = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  price: number;
  category: 'Signature' | 'Pure' | 'Single Origin';
  roast: string;
  notes: string;
  image: string;
  accent: string;
  badge?: string;
};

type CartItem = { product: Product; quantity: number };

const products: Product[] = [
  {
    id: 'robusta-aa',
    name: 'Robusta AA',
    shortName: 'Robusta AA',
    description: 'Full-bodied, bold and unapologetically South Indian.',
    price: 285,
    category: 'Signature',
    roast: 'Dark roast',
    notes: 'Cocoa · toasted grain · molasses',
    image: robustaPath,
    accent: '#df6b43',
    badge: 'Best seller',
  },
  {
    id: 'pure-a',
    name: 'Pure-A',
    shortName: 'Pure-A',
    description: 'A clean, bright cup with the fragrance of fresh harvest.',
    price: 340,
    category: 'Pure',
    roast: 'Medium roast',
    notes: 'Jaggery · red fruit · almond',
    image: pureAPath,
    accent: '#e8ab2e',
  },
  {
    id: 'pure-pb',
    name: 'Pure-PB',
    shortName: 'Pure-PB',
    description: 'A generous house cup with a gently smoky finish.',
    price: 315,
    category: 'Pure',
    roast: 'Medium-dark roast',
    notes: 'Caramel · roasted nut · spice',
    image: purePBPath,
    accent: '#b83a36',
  },
  {
    id: 'arabica-aa',
    name: 'Arabica AA',
    shortName: 'Arabica AA',
    description: 'Silky and aromatic, for slow mornings and second cups.',
    price: 420,
    category: 'Single Origin',
    roast: 'Medium roast',
    notes: 'Orange peel · cacao · brown sugar',
    image: arabicaPath,
    accent: '#d47b43',
    badge: 'Limited harvest',
  },
  {
    id: 'mysore-nuggets',
    name: 'Mysore Nuggets',
    shortName: 'Mysore Nuggets',
    description: 'The rare local lot: soft, sweet and unmistakably Mysore.',
    price: 490,
    category: 'Single Origin',
    roast: 'Light-medium roast',
    notes: 'Honey · cashew · soft florals',
    image: nuggetsPath,
    accent: '#237548',
    badge: 'From our region',
  },
];

const navItems = [
  { label: 'Shop', href: '#shop' },
  { label: 'Our story', href: '#story' },
  { label: 'The ritual', href: '#ritual' },
];
const queryClient = new QueryClient();

function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function ProductCard({
  product,
  onAdd,
  onQuickView,
  isFavorite,
  onFavorite,
}: {
  product: Product;
  onAdd: (product: Product) => void;
  onQuickView: (product: Product) => void;
  isFavorite: boolean;
  onFavorite: (id: string) => void;
}) {
  return (
    <article
      className="product-card group relative flex flex-col overflow-hidden rounded-[1.45rem] border border-[#decdb9] bg-[#f8f1e8] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(86,27,35,.14)]"
      data-testid={`card-product-${product.id}`}
    >
      <div className="relative min-h-[310px] overflow-hidden px-5 pt-5" style={{ backgroundColor: product.accent }}>
        {product.badge ? (
          <span className="absolute left-5 top-5 z-10 rounded-full bg-[#f9e7c5] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.17em] text-[#67232d]">
            {product.badge}
          </span>
        ) : null}
        <button
          type="button"
          className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-[#f9e7c5]/60 bg-[#f9e7c5]/80 text-[#67232d] transition-colors hover:bg-[#f9e7c5]"
          onClick={() => onFavorite(product.id)}
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${product.name} ${isFavorite ? 'from' : 'to'} favorites`}
          data-testid={`button-favorite-${product.id}`}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={() => onQuickView(product)}
          className="product-image absolute bottom-[-4px] left-[13%] w-[74%] cursor-zoom-in drop-shadow-[0_18px_12px_rgba(55,25,10,.24)]"
          aria-label={`View details for ${product.name}`}
          data-testid={`button-view-${product.id}`}
        >
          <img src={product.image} alt={`${product.name} coffee bag`} className="w-full" />
        </button>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-5">
        <div className="mb-2 flex items-start justify-between gap-4">
          <h3 className="serif text-[1.45rem] font-semibold leading-none text-[#67232d]">{product.name}</h3>
          <span className="mono pt-1 text-xs font-medium text-[#67232d]">{formatPrice(product.price)}</span>
        </div>
        <p className="min-h-[42px] text-[13px] leading-[1.45] text-[#775e53]">{product.description}</p>
        <div className="mt-4 flex items-center justify-between border-t border-[#decdb9] pt-3">
          <span className="text-[10px] uppercase tracking-[.13em] text-[#9a7564]">{product.roast}</span>
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="group/add flex items-center gap-2 rounded-full bg-[#67232d] px-4 py-2.5 text-xs font-semibold text-[#f9e7c5] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            data-testid={`button-add-${product.id}`}
          >
            Add to basket <Plus size={14} className="transition-transform group-hover/add:rotate-90" />
          </button>
        </div>
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
}: {
  items: CartItem[];
  open: boolean;
  onClose: () => void;
  onChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Your coffee basket">
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
              <div className="mb-5 grid size-20 place-items-center rounded-full bg-[#f0d45f] text-[#67232d]"><Coffee size={30} /></div>
              <h3 className="serif text-2xl text-[#67232d]">It is quiet in here.</h3>
              <p className="mt-2 max-w-[230px] text-sm leading-relaxed text-[#775e53]">Find a bag for your filter, moka pot, or the familiar steel tumbler.</p>
              <button type="button" onClick={onClose} className="mt-6 rounded-full bg-[#67232d] px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5]" data-testid="button-browse-cart">Browse the coffee</button>
            </div>
          ) : (
            <div className="space-y-5">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex gap-4 border-b border-[#decdb9] pb-5" data-testid={`cart-item-${product.id}`}>
                  <div className="grid size-[82px] shrink-0 place-items-center rounded-xl p-1" style={{ backgroundColor: product.accent }}>
                    <img src={product.image} alt="" className="max-h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <h3 className="serif text-lg text-[#67232d]">{product.name}</h3>
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
            <p className="mt-2 text-xs text-[#9a7564]">Shipping is calculated at checkout. Free delivery over ₹900.</p>
            <button type="button" onClick={() => window.alert('Checkout is ready for the next step.')} className="mt-5 flex w-full items-center justify-center gap-3 rounded-full bg-[#b83a36] px-5 py-4 text-sm font-semibold text-[#fdf8f1] transition-transform hover:-translate-y-0.5" data-testid="button-checkout">Continue to checkout <ArrowRight size={16} /></button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Storefront() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All coffee');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const categories = ['All coffee', 'Signature', 'Pure', 'Single Origin'];
  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = activeCategory === 'All coffee' || product.category === activeCategory;
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || `${product.name} ${product.description} ${product.notes}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  }), [activeCategory, searchTerm]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1 }];
    });
    setAddedId(product.id);
    window.setTimeout(() => setAddedId(null), 650);
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
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="grain min-h-[100dvh] overflow-x-hidden bg-[#f8f1e8] text-[#67232d]">
      <div className="bg-[#67232d] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[.2em] text-[#f7d552]">Free delivery across India on orders above ₹900</div>
      <header className="relative z-40 mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <button type="button" onClick={() => scrollTo('#top')} className="flex items-center gap-3" aria-label="Gayathri Coffee home" data-testid="button-home">
          <img src={logoPath} alt="Gayathri Coffee" className="h-16 w-auto object-contain object-left sm:h-[76px]" />
        </button>
        <nav className="hidden items-center gap-8 text-xs font-semibold uppercase tracking-[.15em] text-[#775e53] md:flex" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.href} type="button" onClick={() => scrollTo(item.href)} className="transition-colors hover:text-[#b83a36]" data-testid={`link-${item.label.toLowerCase().replace(' ', '-')}`}>{item.label}</button>)}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSearchOpen((value) => !value)} className="grid size-10 place-items-center rounded-full border border-[#decdb9] text-[#67232d] hover:bg-[#efe1d2]" aria-label="Search coffee" data-testid="button-search"><Search size={18} /></button>
          <button type="button" onClick={() => setCartOpen(true)} className={`relative grid size-10 place-items-center rounded-full bg-[#f0d45f] text-[#67232d] ${addedId ? 'animate-cart-pop' : ''}`} aria-label={`Open basket with ${cartCount} item${cartCount === 1 ? '' : 's'}`} data-testid="button-cart"><ShoppingBag size={18} /><span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#b83a36] text-[10px] font-bold text-[#fdf8f1]" data-testid="text-cart-count">{cartCount}</span></button>
          <button type="button" onClick={() => setMobileNav((value) => !value)} className="grid size-10 place-items-center rounded-full border border-[#decdb9] text-[#67232d] md:hidden" aria-label="Toggle menu" data-testid="button-menu"><Menu size={19} /></button>
        </div>
        {mobileNav ? (
          <div className="absolute left-4 right-4 top-[92px] rounded-2xl border border-[#decdb9] bg-[#f8f1e8] p-3 shadow-xl md:hidden">
            {navItems.map((item) => <button type="button" key={item.href} onClick={() => scrollTo(item.href)} className="block w-full rounded-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-[.15em] text-[#775e53] hover:bg-[#efe1d2]" data-testid={`mobile-link-${item.label.toLowerCase().replace(' ', '-')}`}>{item.label}</button>)}
          </div>
        ) : null}
      </header>

      {searchOpen ? (
        <div className="mx-auto max-w-[1400px] px-5 pb-3 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3 rounded-2xl border border-[#decdb9] bg-[#fdf8f1] px-4 py-3">
            <Search size={17} className="text-[#9a7564]" />
            <input autoFocus value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); scrollTo('#shop'); }} placeholder="Search a roast, a note, a morning..." className="w-full bg-transparent text-sm text-[#67232d] outline-none placeholder:text-[#b59c8b]" aria-label="Search coffee" data-testid="input-search" />
            {searchTerm ? <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search" data-testid="button-clear-search"><X size={16} /></button> : null}
          </div>
        </div>
      ) : null}

      <main id="top">
        <section className="relative mx-auto grid max-w-[1400px] gap-10 px-5 pb-20 pt-8 sm:px-8 md:pb-28 md:pt-12 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-12 lg:pt-16">
          <div className="animate-rise relative z-10 max-w-[600px]">
            <div className="mb-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.25em] text-[#b83a36]"><span className="h-px w-10 bg-[#b83a36]" />Since 2002 · Mysore, India</div>
            <h1 className="serif max-w-[680px] text-[3.8rem] leading-[.93] tracking-[-.05em] text-[#67232d] sm:text-[5rem] lg:text-[6.8rem]">The good<br /><em className="text-[#b83a36]">old</em> cup.</h1>
            <p className="mt-7 max-w-[430px] text-[15px] leading-[1.7] text-[#775e53]">Carefully selected beans, patient roasting and the kind of aroma that makes a house feel like home. From our wholesale house in Malleshwaram to your morning filter.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => scrollTo('#shop')} className="flex items-center gap-3 rounded-full bg-[#b83a36] px-6 py-4 text-xs font-semibold uppercase tracking-[.13em] text-[#fdf8f1] transition-transform hover:-translate-y-1" data-testid="button-shop-coffee">Shop the collection <ArrowDownRight size={16} /></button>
              <button type="button" onClick={() => scrollTo('#story')} className="border-b border-[#67232d] pb-1 text-xs font-semibold uppercase tracking-[.13em] text-[#67232d]" data-testid="button-read-story">Our story</button>
            </div>
            <div className="mt-12 flex items-center gap-6 border-t border-[#decdb9] pt-5">
              <div><p className="serif text-2xl text-[#67232d]">24</p><p className="text-[10px] uppercase tracking-[.14em] text-[#9a7564]">years of ritual</p></div>
              <div className="h-8 w-px bg-[#decdb9]" />
              <div><p className="serif text-2xl text-[#67232d]">5</p><p className="text-[10px] uppercase tracking-[.14em] text-[#9a7564]">honest coffees</p></div>
            </div>
          </div>
          <div className="relative animate-rise [animation-delay:150ms]">
            <div className="absolute -right-5 -top-8 z-10 hidden size-28 animate-float rounded-full bg-[#f0d45f] p-4 text-center text-[10px] font-semibold uppercase leading-[1.3] tracking-[.12em] text-[#67232d] sm:grid sm:place-items-center">Roasted<br />with care<br /><span className="text-lg">·</span></div>
            <div className="relative overflow-hidden rounded-[2rem] bg-[#df6b43] shadow-[0_24px_70px_rgba(86,27,35,.2)]">
              <img src={heroPath} alt="Gayathri Coffee bags on a wood counter in a warm roastery" className="aspect-[1.18] w-full object-cover mix-blend-multiply" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#471b22]/55 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-6 right-6 flex items-end justify-between text-[#fdf8f1]">
                <div><p className="mono text-[9px] uppercase tracking-[.22em] text-[#f0d45f]">A familiar feeling</p><p className="serif mt-1 text-2xl">Good coffee, no shortcuts.</p></div>
                <Coffee size={29} strokeWidth={1.4} />
              </div>
            </div>
            <p className="mono mt-4 text-right text-[10px] uppercase tracking-[.18em] text-[#9a7564]">Small batch · South Indian roast house</p>
          </div>
        </section>

        <div className="marquee border-y border-[#decdb9] bg-[#f0d45f] py-3.5 text-[#67232d]">
          <div className="marquee-track gap-8 text-[10px] font-semibold uppercase tracking-[.22em]"><span>Filter coffee for slow mornings</span><span>·</span><span>Selected in Mysore</span><span>·</span><span>Roasted with care</span><span>·</span><span>Filter coffee for slow mornings</span><span>·</span><span>Selected in Mysore</span><span>·</span></div>
        </div>

        <section id="shop" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div><p className="mono text-[10px] uppercase tracking-[.22em] text-[#b83a36]">The coffee shelf</p><h2 className="serif mt-3 max-w-[550px] text-4xl leading-none tracking-[-.035em] text-[#67232d] sm:text-6xl">Find your<br /><em>everyday favourite.</em></h2></div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Coffee categories">
              {categories.map((category) => <button type="button" key={category} onClick={() => setActiveCategory(category)} className={`rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.1em] transition-colors ${activeCategory === category ? 'border-[#67232d] bg-[#67232d] text-[#f9e7c5]' : 'border-[#decdb9] text-[#775e53] hover:border-[#b83a36] hover:text-[#b83a36]'}`} data-testid={`button-filter-${category.toLowerCase().replace(' ', '-')}`}>{category}</button>)}
            </div>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onQuickView={setQuickView} isFavorite={favorites.includes(product.id)} onFavorite={(id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />)}
          </div>
          {filteredProducts.length === 0 ? <div className="mt-10 rounded-3xl border border-dashed border-[#cdb9a4] bg-[#f1e5d8] py-16 text-center"><p className="serif text-3xl text-[#67232d]">No cup by that name.</p><p className="mt-2 text-sm text-[#775e53]">Try a different roast or clear the search.</p><button type="button" onClick={() => { setSearchTerm(''); setActiveCategory('All coffee'); }} className="mt-5 rounded-full bg-[#67232d] px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-[#f9e7c5]" data-testid="button-clear-filters">Clear filters</button></div> : null}
          <p className="mt-7 text-center text-xs text-[#9a7564]">{filteredProducts.length} coffees in the current pour</p>
        </section>

        <section id="story" className="relative overflow-hidden bg-[#67232d] text-[#f9e7c5]">
          <div className="absolute -right-32 -top-32 size-[430px] rounded-full border border-[#f0d45f]/20" /><div className="absolute -right-12 -top-12 size-[270px] rounded-full border border-[#f0d45f]/20" />
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-12">
            <div className="relative">
              <div className="absolute -left-5 top-8 h-28 w-1 bg-[#f0d45f]" />
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#f0d45f]">A wholesale house, remembered</p>
              <h2 className="serif mt-5 max-w-[510px] text-5xl leading-[.98] tracking-[-.04em] sm:text-7xl">The taste of <em>staying awhile.</em></h2>
            </div>
            <div className="max-w-[570px] lg:justify-self-end">
              <p className="text-lg leading-[1.65] text-[#f7dec1]">Gayathri Coffee began in 2002 with a simple belief: good beans do not need a long explanation. They need a careful hand, a familiar roast and a place in your daily rhythm.</p>
              <p className="mt-6 text-[14px] leading-[1.75] text-[#d9bfa9]">Rooted in Mysore and Malleshwaram, our blends carry the warmth of a generations-old wholesale house. We select each lot for the cup it makes, roast in small batches, and leave out the shortcuts and unnecessary chemicals.</p>
              <button type="button" onClick={() => scrollTo('#ritual')} className="mt-8 flex items-center gap-3 border-b border-[#f0d45f] pb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#f0d45f]" data-testid="button-discover-story">Discover the ritual <ArrowRight size={15} /></button>
            </div>
          </div>
        </section>

        <section id="ritual" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 md:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div className="relative rounded-[2rem] bg-[#df6b43] p-8 sm:p-12">
              <div className="absolute right-7 top-7 text-[#67232d]"><Sparkles size={26} strokeWidth={1.4} /></div>
              <p className="mono text-[10px] uppercase tracking-[.22em] text-[#67232d]">The South Indian way</p>
              <h2 className="serif mt-5 max-w-[560px] text-5xl leading-[.95] tracking-[-.04em] text-[#67232d] sm:text-7xl">Make time<br /><em>for the pour.</em></h2>
              <div className="mt-12 grid gap-5 border-t border-[#67232d]/20 pt-6 sm:grid-cols-3">
                {['Boil the water', 'Add the decoction', 'Take the first sip'].map((step, index) => <div key={step}><span className="mono text-xs text-[#f0d45f]">0{index + 1}</span><p className="mt-2 text-sm font-semibold text-[#67232d]">{step}</p><p className="mt-1 text-xs leading-relaxed text-[#7e342f]">{['Let the kettle have its moment.', 'Strong, smooth, to your measure.', 'Steel tumbler optional. Comfort is not.'][index]}</p></div>)}
              </div>
            </div>
            <div className="lg:pl-12">
              <div className="mb-7 flex gap-1 text-[#b83a36]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} fill="currentColor" />)}</div>
              <blockquote className="serif text-3xl leading-[1.2] text-[#67232d] sm:text-4xl">“It tastes like the coffee my mother made, only better because I did not have to leave home.”</blockquote>
              <p className="mono mt-7 text-[10px] uppercase tracking-[.18em] text-[#9a7564]">— Ananya, Bengaluru</p>
              <div className="mt-12 border-t border-[#decdb9] pt-6"><p className="text-sm leading-[1.7] text-[#775e53]">Not sure where to start?</p><button type="button" onClick={() => { setActiveCategory('Signature'); scrollTo('#shop'); }} className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#b83a36]" data-testid="button-start-signature">Start with our signatures <ArrowRight size={15} /></button></div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#decdb9] bg-[#f0d45f]">
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

      <CartDrawer items={cart} open={cartOpen} onClose={() => setCartOpen(false)} onChange={changeQuantity} onRemove={(id) => setCart((current) => current.filter((item) => item.product.id !== id))} />
      {quickView ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#3a161e]/45 px-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`Details for ${quickView.name}`}>
          <div className="relative grid max-h-[90vh] w-full max-w-[850px] overflow-auto rounded-[1.7rem] bg-[#f8f1e8] shadow-2xl md:grid-cols-2">
            <button type="button" onClick={() => setQuickView(null)} className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-[#f8f1e8]/85 text-[#67232d]" aria-label="Close details" data-testid="button-close-quick-view"><X size={18} /></button>
            <div className="grid min-h-[350px] place-items-center p-10" style={{ backgroundColor: quickView.accent }}><img src={quickView.image} alt={`${quickView.name} coffee bag`} className="max-h-[430px] w-full object-contain drop-shadow-[0_20px_14px_rgba(55,25,10,.25)]" /></div>
            <div className="flex flex-col justify-center p-8 sm:p-10"><p className="mono text-[10px] uppercase tracking-[.2em] text-[#b83a36]">{quickView.category} · {quickView.roast}</p><h2 className="serif mt-3 text-5xl leading-none text-[#67232d]">{quickView.name}</h2><p className="mt-5 text-sm leading-[1.7] text-[#775e53]">{quickView.description}</p><div className="mt-6 border-y border-[#decdb9] py-4"><p className="mono text-xs uppercase tracking-[.12em] text-[#9a7564]">Cup notes</p><p className="mt-2 text-sm font-medium text-[#67232d]">{quickView.notes}</p></div><div className="mt-7 flex items-center justify-between gap-4"><span className="mono text-lg font-medium text-[#67232d]">{formatPrice(quickView.price)}</span><button type="button" onClick={() => { addToCart(quickView); setQuickView(null); setCartOpen(true); }} className="flex items-center gap-2 rounded-full bg-[#b83a36] px-5 py-3.5 text-xs font-semibold uppercase tracking-[.1em] text-[#fdf8f1]" data-testid={`button-quick-add-${quickView.id}`}>Add to basket <Plus size={15} /></button></div></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Storefront} />
        <Route component={Storefront} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;