'use client';

import { useState } from 'react';

// Avatar with graceful fallback to initials when the image 404s or requires auth.
export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [ok, setOk] = useState(Boolean(src));
  const initials = name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const style = { width: size, height: size };
  if (src && ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        style={style}
        onError={() => setOk(false)}
        className="rounded-full object-cover border border-line shrink-0"
      />
    );
  }
  return (
    <div
      style={style}
      className="rounded-full grid place-items-center bg-card border border-line text-[0.6rem] font-bold text-slate shrink-0"
    >
      {initials || '—'}
    </div>
  );
}
