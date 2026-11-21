'use client';
import { useSyncExternalStore } from 'react';
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Do not accept edits to SSR inputs before their React event handlers are attached.
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
