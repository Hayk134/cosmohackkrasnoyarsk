import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatNumber(val: number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatInt(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return new Intl.NumberFormat('ru-RU').format(Math.round(val));
}

export function formatRub(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '— ₽';
  return `${formatNumber(val, 0)} ₽`;
}

export function formatPercent(val: number | null | undefined, decimals: number = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '— %';
  return `${formatNumber(val * 100, decimals)}%`;
}

export function shortenHash(hash: string | null | undefined, start: number = 6, end: number = 6): string {
  if (!hash) return '';
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  }
}
