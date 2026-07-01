export type TimeElapsedResult = {
  label: string;
  urgency: 'low' | 'medium' | 'high';
};

export function timeElapsed(timestamp: Date): TimeElapsedResult {
  const ms = Date.now() - timestamp.getTime();
  const hours = ms / 3_600_000;
  const days = ms / 86_400_000;

  if (hours < 24) {
    return { label: `${Math.floor(hours)}h`, urgency: 'low' };
  }
  if (days < 5) {
    return { label: `${Math.floor(days)}d`, urgency: 'low' };
  }
  if (days < 10) {
    return { label: `${Math.floor(days)}d`, urgency: 'medium' };
  }
  return { label: `${Math.floor(days)}d`, urgency: 'high' };
}
