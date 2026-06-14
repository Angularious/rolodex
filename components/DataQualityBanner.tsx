'use client';

export default function DataQualityBanner() {
  return (
    <div className="retro-panel-flat panel-accent pop-in p-3 my-4 flex items-start gap-3 bg-[#fff7c2]">
      <span className="font-display text-2xl leading-none">⚠</span>
      <div className="text-sm">
        <span className="font-display text-base">Accept-all domain.</span> This company&apos;s mail
        server accepts mail to any address, so individual emails below are pattern-inferred and
        cannot be reliably verified. Treat confidence scores accordingly.
      </div>
    </div>
  );
}
