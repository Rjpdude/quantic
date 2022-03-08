import { state, pathTracker } from '../obj'

describe('access', () => {
  test('proxy', () => {
    const proxy = state({
      num: 10,
      str: 'ryan',
      nested: {
        list: new Set<number>()
      },

      get sum(): number {
        return Array.from(this.nested.list.values())
          .reduce((a, b) => a + b, 0)
      },

      setNum(to: number) {
        this.num = to
      },
      setStr(to: string) {
        this.str = to
      },
      add(num: number) {
        this.nested.list.add(num)
      }
    })

    pathTracker.autorun(() => {
      console.log(proxy.num)
    })
    pathTracker.autorun(() => {
      console.log(proxy.num)
    })
  })
})
