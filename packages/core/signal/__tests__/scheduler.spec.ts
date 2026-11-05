import { flushJobs, nextTick, queueJob } from '../src/internal'

describe('internal job scheduler', () => {
  it('runs every queued job when one throws and rethrows the first error', () => {
    const calls: string[] = []
    queueJob(() => calls.push('a'))
    queueJob(() => {
      throw new Error('first')
    })
    queueJob(() => {
      throw new Error('second')
    })
    queueJob(() => calls.push('d'))

    expect(() => flushJobs()).toThrow('first')
    expect(calls).toEqual(['a', 'd'])

    flushJobs()
    expect(calls).toEqual(['a', 'd'])
  })

  it('deduplicates jobs and resolves nextTick after jobs queued by the flush', async () => {
    const calls: string[] = []
    const second = () => calls.push('second')
    const first = () => {
      calls.push('first')
      queueJob(second)
    }
    queueJob(first)
    queueJob(first)

    await nextTick()
    expect(calls).toEqual(['first', 'second'])
  })
})
