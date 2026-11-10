const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }) : null;

/** "em 10 minutos", "amanhã", "em 3 dias"… */
export function formatRelative(t: number, now = Date.now()): string {
  const diff = t - now;
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  if (!rtf) return new Date(t).toLocaleString();
  if (abs < 60_000) return diff <= 0 ? "agora" : "em menos de 1 minuto";
  if (abs < 3_600_000) return rtf.format(sign * Math.round(abs / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(sign * Math.round(abs / 3_600_000), "hour");
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return rtf.format(sign * days, "day");
  if (days < 365) return rtf.format(sign * Math.round(days / 30), "month");
  return rtf.format(sign * Math.round(days / 365), "year");
}

export const formatDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
export const formatDateTime = (t: number) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
