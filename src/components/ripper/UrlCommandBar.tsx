import React, { useEffect, useRef } from 'react';
import {
  ClipboardPaste,
  Link2,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useJobStore } from '../../store/useJobStore';

const DEMO_URLS = [
  {
    label: 'YouTube 4K Studio Clip',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  },
  {
    label: 'SoundCloud Producer Stem Track',
    url: 'https://soundcloud.com/forss/flickermood'
  }
];

export const UrlCommandBar: React.FC = () => {
  const urlInput = useJobStore((s) => s.urlInput);
  const setUrlInput = useJobStore((s) => s.setUrlInput);
  const isProbing = useJobStore((s) => s.isProbing);
  const probeError = useJobStore((s) => s.probeError);
  const probeUrl = useJobStore((s) => s.probeUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        try {
          const text = await navigator.clipboard.readText();
          if (text && /^https?:\/\//i.test(text.trim())) {
            e.preventDefault();
            setUrlInput(text.trim());
            probeUrl(text.trim());
          }
        } catch {
          // Clipboard read requires focus
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [probeUrl, setUrlInput]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setUrlInput(text.trim());
        probeUrl(text.trim());
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim() && !isProbing) {
      probeUrl();
    }
  };

  return (
    <div className="w-full space-y-2">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 bg-base-200 border border-base-300 focus-within:border-base-content/40 rounded-xl px-3.5 py-2 transition-colors duration-150"
      >
        <Link2 className="w-4 h-4 text-base-content/50 shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted && /^https?:\/\//i.test(pasted.trim())) {
              setTimeout(() => probeUrl(pasted.trim()), 40);
            }
          }}
          placeholder="Paste YouTube, Instagram Reel, TikTok, X, Twitch, or SoundCloud URL (Ctrl+V)…"
          className="w-full bg-transparent text-sm text-base-content placeholder:text-base-content/45 focus:outline-none"
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            className="btn btn-sm btn-ghost gap-1.5"
            title="Paste URL from clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste</span>
          </button>

          <button
            type="submit"
            disabled={isProbing || !urlInput.trim()}
            className="btn btn-sm btn-primary gap-1.5"
          >
            {isProbing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading…</span>
              </>
            ) : (
              <span>Load Link</span>
            )}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-base-content/50 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-accent" /> Samples:
          </span>
          {DEMO_URLS.map((preset) => (
            <button
              key={preset.url}
              type="button"
              onClick={() => {
                setUrlInput(preset.url);
                probeUrl(preset.url);
              }}
              className="btn btn-xs btn-ghost border border-base-300 font-normal text-base-content/75 hover:text-base-content"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {probeError && (
          <span className="text-xs text-error">{probeError}</span>
        )}
      </div>
    </div>
  );
};
