/**
 * 内存监控工具
 */
export class MemoryMonitor {
  private initialMemory: number = 0
  private measurements: number[] = []

  /**
   * 开始监控
   */
  start(): void {
    this.initialMemory = this.getMemoryUsage()
    this.measurements = []
  }

  /**
   * 记录当前内存使用
   */
  record(): number {
    const current = this.getMemoryUsage()
    this.measurements.push(current)
    return current
  }

  /**
   * 获取内存使用统计
   */
  getStats(): {
    initial: number
    current: number
    peak: number
    average: number
    totalIncrease: number
    measurements: number[]
  } {
    const current = this.getMemoryUsage()
    const peak = Math.max(...this.measurements, current)
    const average =
      this.measurements.length > 0
        ? this.measurements.reduce((a, b) => a + b, 0) /
          this.measurements.length
        : current

    return {
      initial: this.initialMemory,
      current,
      peak,
      average,
      totalIncrease: current - this.initialMemory,
      measurements: [...this.measurements],
    }
  }

  /**
   * 检查内存泄漏
   */
  checkMemoryLeak(threshold: number = 10 * 1024 * 1024): boolean {
    const stats = this.getStats()
    return stats.totalIncrease > threshold
  }

  /**
   * 强制垃圾回收
   */
  forceGC(): void {
    if (globalThis.gc) {
      globalThis.gc()
    }
  }

  /**
   * 获取当前内存使用
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed
    }

    // 浏览器环境下的近似内存使用
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize
    }

    return 0
  }

  /**
   * 格式化内存大小
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}
