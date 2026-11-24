import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders a QR code for short text such as a member ID or a reward code. Always black on white so it scans reliably. */
export function QrImage({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then((url) => { if (active) setSrc(url); })
      .catch(() => { if (active) setSrc(''); });
    return () => { active = false; };
  }, [value, size]);

  if (!src) return <div className="qr-placeholder" style={{ width: size, height: size }} role="img" aria-label={`${label} (loading)`} />;
  return <img className="qr-image" src={src} width={size} height={size} alt={label} />;
}
