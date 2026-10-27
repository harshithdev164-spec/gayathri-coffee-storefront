import { useEffect, useMemo, useRef, useState } from 'react';

export type CarouselItem = { src: string; alt: string; title?: string; subtitle?: string };

type Props = {
  items: CarouselItem[];
  preset?: 'cylinder';
  intro?: 'rise' | 'none';
  cardWidth?: number;
  aspectRatio?: number;
  /** Drift speed in degrees per second. */
  speed?: number;
  captions?: boolean;
  gap?: number;
  tilt?: number;
  /** 1 = full cylinder, lower values flatten each card's turn towards the ring. */
  curve?: number;
  perspective?: number;
  autoplay?: 'drift' | 'step' | 'off';
  /** Seconds between steps when autoplay is "step". */
  interval?: number;
  direction?: 'left' | 'right';
  /** 0-1: how long a drag release keeps spinning. */
  momentum?: number;
  snap?: boolean;
  pauseOnHover?: boolean;
  focusOnClick?: boolean;
  draggable?: boolean;
  /** Inner image shift as cards swing past, 0-1. */
  parallax?: number;
  /** Widens the ring so cards spread further apart, 0-1. */
  stretch?: number;
  fadeColor?: string;
  depthFade?: number;
  /** Darkening on the inside (back) faces of the cylinder, 0-1. */
  innerShade?: number;
  cornerRadius?: number;
};

const MIN_SLOTS = 12;
const RESUME_DELAY_MS = 1800;
const rad = (deg: number) => (deg * Math.PI) / 180;

export default function CircularCarousel({
  items,
  intro = 'rise',
  cardWidth = 220,
  aspectRatio = 1,
  speed = 14,
  captions = false,
  gap = 25,
  tilt = -5,
  curve = 1,
  perspective = 2500,
  autoplay = 'drift',
  interval = 3,
  direction = 'left',
  momentum = 0.6,
  snap = true,
  pauseOnHover = true,
  focusOnClick = true,
  draggable = true,
  parallax = 0.3,
  stretch = 0.5,
  fadeColor = '#000000',
  depthFade = 0.55,
  innerShade = 0.6,
  cornerRadius = 12,
}: Props) {
  // A cylinder of 3 cards is just a triangle, so repeat the items to fill the ring.
  const slots = useMemo(() => {
    if (items.length === 0) return [];
    const repeats = Math.max(1, Math.ceil(MIN_SLOTS / items.length));
    return Array.from({ length: items.length * repeats }, (_, i) => items[i % items.length]);
  }, [items]);

  const count = slots.length;
  const step = 360 / Math.max(count, 1);
  const radius = ((cardWidth + gap) / (2 * Math.tan(Math.PI / Math.max(count, 3)))) * (1 + stretch * 0.5);
  const cardHeight = cardWidth / aspectRatio;
  const dir = direction === 'left' ? 1 : -1;

  const [angle, setAngle] = useState(0);
  const [risen, setRisen] = useState(intro === 'none');
  const state = useRef({
    angle: 0,
    velocity: 0,
    hover: false,
    dragging: false,
    moved: false,
    lastX: 0,
    lastT: 0,
    resumeAt: 0,
    target: null as number | null,
    stepTimer: 0,
  });

  useEffect(() => {
    if (intro === 'none') return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRisen(true)));
    return () => cancelAnimationFrame(id);
  }, [intro]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = state.current;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const idle = !s.dragging && now >= s.resumeAt && !(pauseOnHover && s.hover);

      if (s.target !== null) {
        // Ease towards a click-focus / snap target.
        const diff = s.target - s.angle;
        if (Math.abs(diff) < 0.05) { s.angle = s.target; s.target = null; }
        else s.angle += diff * Math.min(1, dt * 7);
      } else if (!s.dragging && Math.abs(s.velocity) > 4) {
        s.angle += s.velocity * dt;
        s.velocity *= Math.pow(Math.max(0.0001, 1 - momentum), dt * 2.2);
        if (Math.abs(s.velocity) <= 4) {
          s.velocity = 0;
          if (snap) s.target = Math.round(s.angle / step) * step;
        }
      } else if (idle && !reduced && autoplay === 'drift') {
        s.angle += dir * speed * dt;
      }

      setAngle(s.angle);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    let timer = 0;
    if (autoplay === 'step' && !reduced) {
      timer = window.setInterval(() => {
        if (s.dragging || performance.now() < s.resumeAt || (pauseOnHover && s.hover)) return;
        s.target = (Math.round(s.angle / step) + dir) * step;
      }, Math.max(0.5, interval) * 1000);
    }
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [autoplay, dir, speed, step, snap, momentum, pauseOnHover, interval]);

  const focusSlot = (index: number) => {
    const s = state.current;
    const slotAngle = index * step;
    // Nearest equivalent turn so the ring takes the short way round.
    s.target = slotAngle + Math.round((s.angle - slotAngle) / 360) * 360;
    s.velocity = 0;
    s.resumeAt = performance.now() + RESUME_DELAY_MS * 2;
  };

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden"
      style={{ perspective, touchAction: 'pan-y', cursor: draggable ? 'grab' : 'default' }}
      onMouseEnter={() => { state.current.hover = true; }}
      onMouseLeave={() => { state.current.hover = false; }}
      onPointerDown={(e) => {
        if (!draggable) return;
        const s = state.current;
        s.dragging = true; s.moved = false; s.target = null; s.velocity = 0;
        s.lastX = e.clientX; s.lastT = performance.now();
      }}
      onPointerMove={(e) => {
        const s = state.current;
        if (!s.dragging) return;
        const now = performance.now();
        const dx = e.clientX - s.lastX;
        if (!s.moved && Math.abs(dx) > 4) { s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
        if (!s.moved) return;
        // Dragging right moves the front card right, which lowers the ring angle.
        const dAngle = -dx * 0.25;
        s.angle += dAngle;
        const dt = Math.max(1, now - s.lastT) / 1000;
        s.velocity = s.velocity * 0.6 + (dAngle / dt) * 0.4;
        s.lastX = e.clientX; s.lastT = now;
      }}
      onPointerUp={() => {
        const s = state.current;
        if (!s.dragging) return;
        s.dragging = false;
        s.resumeAt = performance.now() + RESUME_DELAY_MS;
        if (Math.abs(s.velocity) <= 4) { s.velocity = 0; if (snap && s.moved) s.target = Math.round(s.angle / step) * step; }
      }}
      onPointerCancel={() => { state.current.dragging = false; }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transformStyle: 'preserve-3d', transform: `translateZ(${-radius}px) rotateX(${tilt}deg) rotateY(${-angle}deg)` }}
      >
        {slots.map((item, i) => {
          const slotAngle = i * step;
          const rel = slotAngle - angle;
          const front = Math.cos(rad(rel)); // 1 = facing viewer, -1 = far side
          const isBack = front < 0;
          const shade = Math.min(
            1,
            depthFade * (1 - front) * 0.5 + (isBack ? innerShade * -front * 0.6 : 0),
          );
          return (
            <figure
              key={i}
              className="absolute m-0"
              style={{
                width: cardWidth,
                height: cardHeight,
                left: -cardWidth / 2,
                top: -cardHeight / 2,
                transform: `rotateY(${slotAngle}deg) translateZ(${radius}px) rotateY(${-(1 - curve) * slotAngle}deg)`,
                cursor: focusOnClick ? 'pointer' : undefined,
              }}
              onClick={() => { if (focusOnClick && !state.current.moved) focusSlot(i); }}
            >
              <div
                className="relative h-full w-full overflow-hidden"
                style={{
                  borderRadius: cornerRadius,
                  opacity: risen ? 1 : 0,
                  transform: risen ? 'translateY(0)' : 'translateY(140px)',
                  transition: intro === 'none' ? undefined : `transform 900ms cubic-bezier(.2,.8,.2,1) ${i * 55}ms, opacity 700ms ease ${i * 55}ms`,
                }}
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  draggable={false}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  style={{
                    transform: `scale(${1 + parallax * 0.4}) translateX(${Math.sin(rad(rel)) * parallax * cardWidth * 0.18}px)`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0" style={{ background: fadeColor, opacity: shade }} />
                {captions && item.title && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    {item.subtitle && <p className="text-[10px] uppercase tracking-[.16em] text-white/70">{item.subtitle}</p>}
                  </figcaption>
                )}
              </div>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
