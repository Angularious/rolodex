'use client';

import { useEffect, useRef } from 'react';

// Animated dot-field background, recreated in the style of tryclean.ai's
// `hm-field` canvas: a staggered grid of dots whose size + color are driven by
// a Gaussian "wave-ring" around a slowly drifting focus point, shimmered by
// four superimposed sine waves, with sparse light-blue "+" marks at the ring's
// edge. Gated by IntersectionObserver and honors prefers-reduced-motion.

// Gradient the dots sample as their intensity rises: dark → accent → cream.
type Stops = [number, number, number][];
const THEMES: Record<string, { stops: Stops; plus: string }> = {
  blue: {
    stops: [
      [8, 12, 28],
      [18, 34, 92],
      [60, 109, 255],
      [122, 168, 255],
      [236, 231, 220],
    ],
    plus: 'rgba(122,168,255,0.4)',
  },
  purple: {
    stops: [
      [12, 8, 28],
      [40, 18, 92],
      [139, 60, 255],
      [180, 140, 255],
      [236, 231, 220],
    ],
    plus: 'rgba(180,140,255,0.4)',
  },
};

function sampleGradient(stops: Stops, t: number): string {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = x * (stops.length - 1);
  const i = Math.floor(f);
  const n = f - i;
  const a = stops[i];
  const b = stops[i + 1 < stops.length ? i + 1 : i];
  const r = (a[0] + (b[0] - a[0]) * n) | 0;
  const g = (a[1] + (b[1] - a[1]) * n) | 0;
  const bl = (a[2] + (b[2] - a[2]) * n) | 0;
  return `rgb(${r},${g},${bl})`;
}

// Focus of the wave-ring (normalized). cy = vertical center, radius = ring
// radius, intensity = overall brightness. Ring sits low/center and is dimmed a
// touch so headline + body copy above it stay readable.
const FOCUS = { cy: 0.58, radius: 0.34, intensity: 0.95 };

const TAU = Math.PI * 2;

export default function FieldBackground({
  className = '',
  theme = 'purple',
}: {
  className?: string;
  theme?: 'blue' | 'purple';
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { stops, plus } = THEMES[theme] ?? THEMES.blue;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let w = 0;
    let h = 0;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Precompute the 8 bucket colors along the gradient (eased).
    const palette = Array.from({ length: 8 }, (_, t) => sampleGradient(stops, Math.pow(t / 7, 1.5)));

    let raf: number | null = null;
    let visible = true;
    let startTs: number | null = null;

    const draw = (ts: number) => {
      raf = null;
      if (!visible) return;
      if (startTs == null) startTs = ts;
      const r = (ts - startTs) * 16e-5; // very slow time
      const aspect = w / h;
      ctx.clearRect(0, 0, w, h);

      const cols = Math.ceil(w / 11) + 1;
      const rows = Math.ceil(h / 11) + 1;
      const fx = 0.5 + 0.06 * Math.sin(0.6 * r); // focus x drift
      const fy = FOCUS.cy + 0.05 * Math.cos(0.5 * r); // focus y drift

      const buckets: number[][] = Array.from({ length: 8 }, () => []);
      const plusMarks: number[] = [];

      for (let e = 0; e < rows; e++) {
        const rowOffset = (1 & e) * 5.5; // stagger odd rows
        for (let s = 0; s < cols; s++) {
          const px = 11 * s + rowOffset;
          const py = 11 * e;
          const i = px / w;
          const c = py / h;
          const mx = (i - fx) * aspect;
          const my = c - fy;
          const dist = Math.sqrt(mx * mx + my * my);
          const g = dist - FOCUS.radius;
          const shimmer =
            0.48 +
            0.55 *
              ((Math.sin(7 * i + 1.3 * r) +
                Math.sin(8 * c - 1.1 * r) +
                Math.sin((i + c) * 6 + r) +
                Math.sin(14 * dist - 1.7 * r)) *
                0.25);
          const x = Math.exp(-(g * g) / 0.1152) * shimmer * FOCUS.intensity;

          if (x > 0.1 && x < 0.18 && ((s + 3 * e) & 31) === 0) {
            plusMarks.push(px, py);
            continue;
          }
          if (x <= 0.06) continue;
          const f = Math.round(7 * Math.min(1, x));
          buckets[f].push(px, py, 5.5 * (0.16 + (f / 7) * 0.7));
        }
      }

      for (let b = 1; b <= 7; b++) {
        const arr = buckets[b];
        if (!arr.length) continue;
        ctx.fillStyle = palette[b];
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 3) {
          ctx.moveTo(arr[k] + arr[k + 2], arr[k + 1]);
          ctx.arc(arr[k], arr[k + 1], arr[k + 2], 0, TAU);
        }
        ctx.fill();
      }

      if (plusMarks.length) {
        ctx.fillStyle = plus;
        for (let k = 0; k < plusMarks.length; k += 2) {
          const px = plusMarks[k];
          const py = plusMarks[k + 1];
          ctx.fillRect(px - 3.5, py - 0.5, 7, 1);
          ctx.fillRect(px - 0.5, py - 3.5, 1, 7);
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    // Pause the loop when the canvas scrolls offscreen.
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && raf == null) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      io.disconnect();
      window.removeEventListener('resize', resize);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [theme]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`fixed inset-0 -z-10 h-full w-full ${className}`}
    />
  );
}
