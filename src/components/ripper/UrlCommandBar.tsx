import React, { useEffect, useRef } from 'react';
import { ClipboardPaste, Link2, Sparkles } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { InputGroup } from '@astryxdesign/core/InputGroup';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
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
    <VStack gap={2} width="100%">
      <form onSubmit={handleSubmit} className="w-full">
        <InputGroup label="Media URL" isLabelHidden size="lg">
          <TextInput
            ref={inputRef}
            type="url"
            label="Media URL"
            isLabelHidden
            hasClear
            size="lg"
            width="100%"
            startIcon={<Link2 className="w-4 h-4" />}
            value={urlInput}
            onChange={(val) => setUrlInput(val)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (pasted && /^https?:\/\//i.test(pasted.trim())) {
                setTimeout(() => probeUrl(pasted.trim()), 40);
              }
            }}
            placeholder="Paste YouTube, Instagram Reel, TikTok, X, Twitch, or SoundCloud URL (Ctrl+V)…"
          />

          <Button
            type="button"
            label="Paste"
            variant="secondary"
            size="lg"
            tooltip="Paste URL from clipboard"
            icon={<ClipboardPaste className="w-3.5 h-3.5" />}
            onClick={handlePasteFromClipboard}
          />

          <Button
            type="submit"
            label={isProbing ? 'Loading…' : 'Load Link'}
            variant="primary"
            size="lg"
            isLoading={isProbing}
            isDisabled={isProbing || !urlInput.trim()}
          />
        </InputGroup>
      </form>

      <HStack vAlign="center" hAlign="between" gap={2} wrap="wrap" className="px-1">
        <HStack vAlign="center" gap={2} wrap="wrap">
          <HStack vAlign="center" gap={1}>
            <Sparkles className="w-3 h-3 text-info" />
            <Text type="supporting" size="sm" color="secondary">
              Samples:
            </Text>
          </HStack>

          {DEMO_URLS.map((preset) => (
            <Button
              key={preset.url}
              label={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setUrlInput(preset.url);
                probeUrl(preset.url);
              }}
            />
          ))}
        </HStack>

        {probeError && (
          <Text type="supporting" size="sm" className="text-error">
            {probeError}
          </Text>
        )}
      </HStack>
    </VStack>
  );
};
