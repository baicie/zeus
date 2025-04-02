export function warn(msg: string, ...args: any[]): void {
  console.warn(`[Zeus warn] ${msg}`, ...args)
}
