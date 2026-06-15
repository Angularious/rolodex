'use client';

export default function DataQualityBanner() {
  return (
    <div className="pop-in p-3 my-4 flex items-start gap-3 rounded-card border border-[rgba(245,200,90,0.32)] bg-[rgba(245,200,90,0.08)] text-cream">
      <span className="text-2xl leading-none text-[#f5c85a]">⚠</span>
      <div className="text-sm">
        <span className="font-display text-base">Accept-all domain.</span> This company&apos;s mail
        server accepts mail to any address, so individual emails below are pattern-inferred and
        cannot be reliably verified. Treat confidence scores accordingly.
      </div>
    </div>
  );
}
