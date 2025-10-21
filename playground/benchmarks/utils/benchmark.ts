export interface BenchmarkStats {
  min: number
  max: number
  avg: number
  median: number
  p95: number
  p99: number
  iterations: number
}

export interface BenchmarkResult {
  name: string
  stats: BenchmarkStats
  framework: string
  scenario: string
}

export class BenchmarkRunner {
  private results: Map<string, BenchmarkResult> = new Map()

  /**
   * 运行基准测试
   */
  run(
    name: string,
    fn: () => Promise<void> | void,
    options: {
      iterations?: number
      warmup?: number
      framework?: string
      scenario?: string
    } = {},
  ): Promise<BenchmarkStats> {
    const {
      iterations = 100,
      warmup = 10,
      framework = 'unknown',
      scenario = 'unknown',
    } = options

    return new Promise((resolve, reject) => {
      const runWarmup = () => {
        let warmupCount = 0
        const runWarmupIteration = () => {
          if (warmupCount >= warmup) {
            runBenchmark()
            return
          }

          const result = fn()
          if (result instanceof Promise) {
            result
              .then(() => {
                warmupCount++
                runWarmupIteration()
              })
              .catch(reject)
          } else {
            warmupCount++
            runWarmupIteration()
          }
        }
        runWarmupIteration()
      }

      const runBenchmark = () => {
        // 强制垃圾回收（如果可用）
        if (globalThis.gc) {
          globalThis.gc()
        }

        const times: number[] = []
        let iterationCount = 0

        const runIteration = () => {
          if (iterationCount >= iterations) {
            const stats = this.calculateStats(times)
            this.results.set(name, {
              name,
              stats,
              framework,
              scenario,
            })
            resolve(stats)
            return
          }

          const start = performance.now()
          const result = fn()

          if (result instanceof Promise) {
            result
              .then(() => {
                const end = performance.now()
                times.push(end - start)
                iterationCount++
                runIteration()
              })
              .catch(reject)
          } else {
            const end = performance.now()
            times.push(end - start)
            iterationCount++
            runIteration()
          }
        }

        runIteration()
      }

      runWarmup()
    })
  }

  /**
   * 运行内存使用测试
   */
  runMemoryTest(
    name: string,
    fn: () => Promise<void> | void,
    options: {
      iterations?: number
      framework?: string
      scenario?: string
    } = {},
  ): Promise<{
    memoryBefore: number
    memoryAfter: number
    memoryDiff: number
  }> {
    const {
      iterations = 10,
      framework = 'unknown',
      scenario = 'memory',
    } = options

    return new Promise((resolve, reject) => {
      // 强制垃圾回收
      if (globalThis.gc) {
        globalThis.gc()
      }

      const memoryBefore = this.getMemoryUsage()
      let iterationCount = 0

      const runIteration = () => {
        if (iterationCount >= iterations) {
          // 强制垃圾回收
          if (globalThis.gc) {
            globalThis.gc()
          }

          const memoryAfter = this.getMemoryUsage()
          const memoryDiff = memoryAfter - memoryBefore

          this.results.set(name, {
            name,
            stats: {
              min: memoryDiff,
              max: memoryDiff,
              avg: memoryDiff,
              median: memoryDiff,
              p95: memoryDiff,
              p99: memoryDiff,
              iterations: 1,
            },
            framework,
            scenario,
          })

          resolve({ memoryBefore, memoryAfter, memoryDiff })
          return
        }

        const result = fn()
        if (result instanceof Promise) {
          result
            .then(() => {
              iterationCount++
              runIteration()
            })
            .catch(reject)
        } else {
          iterationCount++
          runIteration()
        }
      }

      runIteration()
    })
  }

  /**
   * 计算统计信息
   */
  private calculateStats(times: number[]): BenchmarkStats {
    const sorted = [...times].sort((a, b) => a - b)
    const sum = times.reduce((a, b) => a + b, 0)

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      iterations: times.length,
    }
  }

  /**
   * 获取内存使用情况
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
   * 获取所有结果
   */
  getAllResults(): BenchmarkResult[] {
    return Array.from(this.results.values())
  }

  /**
   * 按框架分组结果
   */
  getResultsByFramework(): Map<string, BenchmarkResult[]> {
    const grouped = new Map<string, BenchmarkResult[]>()

    for (const result of this.results.values()) {
      if (!grouped.has(result.framework)) {
        grouped.set(result.framework, [])
      }
      grouped.get(result.framework)!.push(result)
    }

    return grouped
  }

  /**
   * 按场景分组结果
   */
  getResultsByScenario(): Map<string, BenchmarkResult[]> {
    const grouped = new Map<string, BenchmarkResult[]>()

    for (const result of this.results.values()) {
      if (!grouped.has(result.scenario)) {
        grouped.set(result.scenario, [])
      }
      grouped.get(result.scenario)!.push(result)
    }

    return grouped
  }

  /**
   * 生成性能报告
   */
  generateReport(): string {
    const byFramework = this.getResultsByFramework()
    const byScenario = this.getResultsByScenario()

    let report = '🏆 Performance Benchmark Report\n'
    report += '================================\n\n'

    // 按框架对比
    report += '📊 Framework Performance:\n'
    for (const [framework, frameworkResults] of byFramework) {
      const avgTime =
        frameworkResults.reduce((sum, r) => sum + r.stats.avg, 0) /
        frameworkResults.length
      report += `  ${framework}: ${avgTime.toFixed(2)}ms average\n`
    }

    report += '\n📈 Scenario Performance:\n'
    for (const [scenario, scenarioResults] of byScenario) {
      const avgTime =
        scenarioResults.reduce((sum, r) => sum + r.stats.avg, 0) /
        scenarioResults.length
      report += `  ${scenario}: ${avgTime.toFixed(2)}ms average\n`
    }

    return report
  }

  /**
   * 生成控制台报告
   */
  generateConsoleReport(): string {
    const byFramework = this.getResultsByFramework()
    const byScenario = this.getResultsByScenario()

    let report = '🏆 Performance Benchmark Report\n'
    report += '================================\n\n'

    // 按框架显示详细结果
    for (const [framework, frameworkResults] of byFramework) {
      report += `📊 ${framework.toUpperCase()} Performance:\n`
      for (const result of frameworkResults) {
        report += `  ${result.name}: ${result.stats.avg.toFixed(2)}ms avg, ${result.stats.p95.toFixed(2)}ms p95\n`
      }
      report += '\n'
    }

    // 按场景对比
    report += '📈 Scenario Comparison:\n'
    for (const [scenario, scenarioResults] of byScenario) {
      report += `  ${scenario}:\n`
      for (const result of scenarioResults) {
        report += `    ${result.framework}: ${result.stats.avg.toFixed(2)}ms\n`
      }
      report += '\n'
    }

    return report
  }

  /**
   * 输出性能报告到控制台
   */
  printReport(): void {
    console.log(this.generateConsoleReport())
  }

  /**
   * 清理结果
   */
  clear(): void {
    this.results.clear()
  }
}
