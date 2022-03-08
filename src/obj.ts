import DeepProxy from 'proxy-deep'
import { v4 as uuid } from 'uuid'
import get from 'lodash.get'
import { createDraft, finishDraft, Draft, setAutoFreeze, enablePatches } from 'immer'
import { podsInstance } from './exports'
import { ResolutionStatus } from './types'

setAutoFreeze(false)
enablePatches()

class PathTracker {
  tracked = new Map<string, Observer[]>()
  crossed: string[] = []
  pendingPath: {
    stateProps: StateProps<any>
    path: string[]
  }

  autorun(fn: Function) {
    this.clear()

    fn()

    const trackedPaths = this.compile()

    for (const path of trackedPaths) {
      if (this.tracked.has(path)) {
        this.tracked.get(path)?.push(new Observer(fn))
      } else {
        this.tracked.set(path, [new Observer(fn)])
      }
    }

    console.log(this.tracked)
  }

  compile() {
    if (this.pendingPath) {
      this.apply()
    }
    return this.crossed
  }

  pending(stateProps: StateProps<any>, path: string[]) {
    if (this.pendingPath && path.length === 1) {
      this.apply()
    }

    this.pendingPath = {
      stateProps,
      path
    }
  }

  apply() {
    if (this.pendingPath) {
      this.crossed.push(`${this.pendingPath.stateProps.id}.${this.pendingPath.path.join('.')}`)
      this.pendingPath = undefined as any
    }
  }

  clear() {
    this.crossed = []
  }
}

export const pathTracker = new PathTracker()

class Observer {
  private flagged = false
  private fn: Function

  constructor(fn: Function) {
    this.fn = fn
  }

  flag() {
    if (!this.flagged) {
      this.flagged = true
    }
  }

  call() {
    this.fn()
  }
}

export class StateProps<P> {
  public readonly id = uuid()

  private initialState: Readonly<P>
  private methods: Record<PropertyKey, Function>
  private boundMethods: Record<PropertyKey, Function> = {}
  private immutable: Readonly<P>
  private draft: Draft<P>

  constructor(props: any, methods: any) {
    this.initialState = props
    this.methods = methods
    this.immutable = finishDraft(createDraft(props))
  }

  applyDraft() {
    this.immutable = finishDraft(this.draft, (patches) => {
      console.log(patches)
    }) as P
    this.draft = undefined as any
  }

  getProxiedState() {
    return this.draft || this.immutable
  }

  currentState() {
    return this.immutable
  }

  getDraft(apply = false) {
    if (apply && !this.draft) {
      this.draft = createDraft(this.immutable)
    }
    return this.draft
  }

  routeToBoundMethod(proxy: any, val: null | undefined, key: PropertyKey) {
    if (key === 'currentState') {
      return this.currentState.bind(this)
    }

    if (key === 'getDraft') {
      return this.getDraft.bind(this)
    }

    if (this.boundMethods[key]) {
      return this.boundMethods[key]
    }

    if (this.methods[key]) {
      return this.boundMethods[key] = (...args: any[]) =>
        podsInstance.useResolutionStatus(ResolutionStatus.ActionHandler, () => {
          const res = this.methods[key].call(proxy, ...args)
          this.applyDraft()
          return res
        })
    }

    return val
  }
}

export function state<O>(obj: O): O {
  const properties: any = {}
  const methods: any = {}

  for (const [key, val] of Object.entries(obj)) {
    const toApply = typeof val === 'function' 
      ? methods : properties
    toApply[key] = val
  }

  return generateExposedStateProxy(new StateProps<O>(properties, methods)) as any
}

export function generateExposedStateProxy(stateProps: StateProps<any>) {
  let ref: any

  const proxy = new DeepProxy({}, {
    get(target, key, receiver) {
      const root = this.path.length === 0

      const proxiedTarget = root
        ? stateProps.getProxiedState()
        : target

      const val = Reflect.get(proxiedTarget, key, root 
        ? proxiedTarget 
        : receiver)

      if (val === null || val === undefined) {
        return root ? stateProps.routeToBoundMethod(ref, val, key) : val
      }

      if (typeof val === 'object') {
        if (podsInstance.resolvingWithin(ResolutionStatus.Pendng)) {
          pathTracker.pending(stateProps, this.path.concat(key as string))
        }
        return this.nest(val)
      }

      if (isModifierFn(target, key, val)) {
        if (!canMutateDraft()) {
          throw stateMutationError()
        }
        const context = get(stateProps.getDraft(true), this.path)
        return context[key].bind(context)
      }

      if (podsInstance.resolvingWithin(ResolutionStatus.Pendng)) {
        pathTracker.pending(stateProps, this.path.concat(key as string))
      }
      return val
    },

    set(_target, key, value) {
      if (!canMutateDraft()) {
        throw stateMutationError()
      }

      const proxiedTarget = this.path.length === 0 
        ? stateProps.getDraft(true)
        : get(stateProps.getDraft(true), this.path)

      return Reflect.set(proxiedTarget, key, value)
    }
  })

  return ref = proxy
}

export function canMutateDraft() {
  return podsInstance.resolvingWithin(
    ResolutionStatus.ActionHandler,
    ResolutionStatus.ConcurrentAction
  )
}

export function isModifierFn(target: any, key: PropertyKey, val: any) {
  return typeof val === 'function' && (isArrayModifierFn(target, key) || isSetOrMapModifierFn(target, key))
}

const arrayModifiers: PropertyKey[] = [
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift'
]

export function isArrayModifierFn(target: any, key: PropertyKey) {
  return Array.isArray(target) && arrayModifiers.includes(key)
}

const setAndMapModifiers: PropertyKey[] = [
  'set',
  'add',
  'delete',
  'clear'
]

export function isSetOrMapModifierFn(target: any, key: PropertyKey) {
  return (target instanceof Set || target instanceof Map) && setAndMapModifiers.includes(key)
}

export function stateMutationError() {
  return new Error(
    'State updates cannot be applied outside action handler functions.'
  )
}
