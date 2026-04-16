// alien-signals integration layer
// This file bridges alien-signals to Zeus's internal reactive system

import alienSignals from 'alien-signals'

// Track read operation for dependency collection
export function trackRead(node: any): void {
  alienSignals.getDependencies()
}

// Track write operation
export function trackWrite(node: any): void {
  // alien-signals handles tracking internally
}

// Trigger update for all observers
export function triggerWrite(node: any): void {
  alienSignals.invalidate(node)
}

export { alienSignals }
