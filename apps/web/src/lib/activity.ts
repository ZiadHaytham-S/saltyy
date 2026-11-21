'use client';
let count = 0;
const listeners = new Set<() => void>();
export const activitySnapshot = () => count;
export const activityServerSnapshot = () => 0;
export function subscribeActivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function beginActivity() {
  count++;
  listeners.forEach((listener) => listener());
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count = Math.max(0, count - 1);
    listeners.forEach((listener) => listener());
  };
}
