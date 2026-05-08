import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseYouTubeId } from '@/lib/youtube';
import { useId } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When true, blur normalizes the input to the bare 11-char ID. Default true. */
  normalizeOnBlur?: boolean;
}

/**
 * Input untuk YouTube URL/ID dengan indikator validasi realtime.
 * Mendukung: youtube.com/live/ID, youtu.be/ID, youtube.com/watch?v=ID,
 * youtube.com/embed|shorts|v/ID, atau ID 11 karakter saja.
 */
export default function YouTubeIdInput({
  value, onChange, placeholder, className, disabled, normalizeOnBlur = true,
}: Props) {
  const id = useId();
  const trimmed = (value || '').trim();
  const parsed = parseYouTubeId(trimmed);
  const isEmpty = trimmed.length === 0;
  const isValid = !!parsed;

  return (
    <div className={className}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (normalizeOnBlur && parsed && parsed !== trimmed) onChange(parsed);
          }}
          placeholder={placeholder || 'URL YouTube atau ID 11 karakter'}
          disabled={disabled}
          className={`pr-9 ${!isEmpty ? (isValid ? 'border-green-500/60 focus-visible:ring-green-500/40' : 'border-destructive/60 focus-visible:ring-destructive/40') : ''}`}
        />
        {!isEmpty && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {isValid
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <AlertCircle className="w-4 h-4 text-destructive" />}
          </span>
        )}
      </div>
      {!isEmpty && (
        <p className={`mt-1 text-[11px] ${isValid ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {isValid
            ? <>Valid · ID: <code className="font-mono">{parsed}</code></>
            : 'Format YouTube tidak dikenali. Tempel link lengkap atau ID 11 karakter.'}
        </p>
      )}
    </div>
  );
}
