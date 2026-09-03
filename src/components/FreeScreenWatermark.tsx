interface Props {
  text: string;
  /** 1-100 (%) */
  opacity: number;
  /** ukuran teks relatif terhadap lebar player (vw-like %) */
  size: number;
}

/**
 * Watermark selayar (100% menutupi area player, termasuk saat fullscreen).
 * Warna putih bersih, transparansi & ukuran diatur admin.
 */
export default function FreeScreenWatermark({ text, opacity, size }: Props) {
  if (!text) return null;
  const alpha = Math.min(1, Math.max(0.01, opacity / 100));
  const fontSize = Math.min(30, Math.max(2, size));
  return (
    <div className="absolute inset-0 z-[26] pointer-events-none select-none flex items-center justify-center overflow-hidden">
      <span
        className="font-extrabold uppercase tracking-widest text-center leading-tight whitespace-pre-wrap px-2"
        style={{
          color: '#ffffff',
          opacity: alpha,
          fontSize: `${fontSize}cqw`,
          textShadow: '0 2px 8px rgba(0,0,0,0.45)',
          width: '100%',
        }}
      >
        {text}
      </span>
    </div>
  );
}
