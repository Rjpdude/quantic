import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { state, use } from '..'
import { mount } from 'enzyme'

function create<T>(arg: new () => T): {
  [K in keyof T]: T[K]
} {
  const inst = new arg()

  console.log(Object.getOwnPropertyDescriptors(inst))

  console.log(
    Object.getOwnPropertyDescriptors(
      Object.getPrototypeOf(inst)
    )
  )

  return {} as any
}

describe('use react hook', () => {
  test.only('idk', () => {
    const user = create(class {
      level: number
      score: number
    
      get target() {
        return Math.pow(this.level, 2)
      }
    
      get complete() {
        return this.target
      }
    
      start(level: number) {
        this.level = level
        this.score = 0
      }
    
      points(toAdd: number) {
        this.score += toAdd
      }
    })
  })

  it('supplies & updates single state property', () => {
    const player = state({
      id: 1,
      username: 'ryan',

      setId(to: number) {
        this.id = to
      },
      setUsername(to: string) {
        this.username = to
      }
    })

    const spy = jest.fn()

    function Component() {
      const username = use(player.username)

      React.useEffect(() => {
        spy(username)
      }, [username])

      return <div />
    }

    mount(<Component />)

    expect(spy).toHaveBeenNthCalledWith(1, 'ryan')

    act(() => {
      player.setUsername('john')
    })

    expect(spy).toHaveBeenNthCalledWith(2, 'john')

    act(() => {
      player.setId(5)
    })

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('supplies & updates state obj with multiple single properties', () => {
    const appData = state({
      events: [] as any[],

      addEvent(event: any) {
        this.events.push(event)
      }
    })

    const player = state({
      username: 'ryan',

      setUsername(to: string) {
        this.username = to
      }
    })

    const game = state({
      stats: {
        score: 10,
        level: 5
      },

      setScore(to: number) {
        this.stats.score = to
      },

      setLevel(to: number) {
        this.stats.level = to
      }
    })

    const spy = jest.fn()

    function Component() {
      const data = use(appData, player.username, game.stats.score)

      React.useEffect(() => {
        spy(data)
      }, [data])

      return <div />
    }

    mount(<Component />)

    expect(spy).toHaveBeenNthCalledWith(1, [{ events: [] }, 'ryan', 10])

    act(() => {
      game.setScore(50)
      player.setUsername('john')
    })

    expect(spy).toHaveBeenNthCalledWith(2, [{ events: [] }, 'john', 50])

    act(() => {
      appData.addEvent({ type: 'click' })
    })

    expect(spy).toHaveBeenNthCalledWith(3, [
      { events: [{ type: 'click' }] },
      'john',
      50
    ])

    act(() => {
      game.setLevel(90)
    })

    expect(spy).toHaveBeenCalledTimes(3)
  })
})
