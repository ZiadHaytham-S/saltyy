'use client';
import { useSyncExternalStore } from 'react';
import { cartItemsSchema, type CartItem } from '@sallty/contracts';
const event = 'sallty-cart-change';
const storageKey = (slug: string) => 'sallty:cart:v1:' + slug;
function snapshot(slug: string) {
  try {
    return localStorage.getItem(storageKey(slug)) ?? '[]';
  } catch {
    return '[]';
  }
}
function parse(value: string): CartItem[] {
  try {
    const data = JSON.parse(value);
    if (Array.isArray(data) && data.length === 0) return [];
    const parsed = cartItemsSchema.safeParse(data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(event, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(event, callback);
  };
}
export function useCart(slug: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(slug),
    () => '[]',
  );
  return parse(value);
}
export function readCart(slug: string) {
  return parse(snapshot(slug));
}
export function changeCart(
  slug: string,
  operation: (items: CartItem[]) => CartItem[],
) {
  const items = operation(parse(snapshot(slug)));
  if (items.length && !cartItemsSchema.safeParse(items).success)
    throw new Error('Cart limit reached');
  localStorage.setItem(storageKey(slug), JSON.stringify(items));
  window.dispatchEvent(new Event(event));
}
export function clearCart(slug: string) {
  changeCart(slug, () => []);
}
