// import { track } from './track'
// import { trigger } from './trigger'

//收集依赖的数据结构   树结构
/*  target1
        └── text1
            └── effectFn1
            └── effectFn2
    target2
        └── text2
            └── effectFn2
*/
const bucket = new WeakMap()


//用一个全局变量存储被注册的副作用函数
let activeEffect

//通过 栈来存储 副作用函数，解决 effect 嵌套时，内层覆盖外层
const effectStack = []

function effect(fn, options = {}) {

  const effectFn = () => {
    // 调用 cleanup 函数完成清除工作  
    cleanup(effectFn)

    // 当调用 effect 注册副作用函数时，将副作用函数 fn 赋值给 activeEffect
    activeEffect = effectFn

    // 在调用副作用函数之前将当前副作用函数压入栈内
    effectStack.push(effectFn)
    //将 fn 的执行结果存储到 res 中
    const res = fn()

    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]

    //手动执行的时候可以拿到返回值
    return res
  }

  // 将 options 挂载到 effectFn 上
  effectFn.options = options // 新增

  effectFn.deps = []

  // 只有非 lazy 的时候，才执行
  //通过这个判断，可以让副作用函数不立即行的功能，我们可以通过返回值来手动的执行副作用
  if (!options.lazy) {
    //执行副作用函数
    effectFn()
  }
  // 将副作用函数作为返回值返回
  return effectFn
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map()

const data = {
  foo: 1,
  test: NaN,
  get bar() {
    //通过 Reflect.get 处理后 这里的this 指向代理对象obj
    console.log(this);
    return this.foo
  }
}

const ITERATE_KEY = Symbol()

/*
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key, receiver) {
    track(target, key)

    //这里直接 return  target[key] target 为 原始对象，data.bar  访问bar的时候，this指向data
    //显然在副作用函数内通过原始对象访问它的某个属性是不会建立响应联系的
    // return target[key]

    //这里使用 reflect 就能解决 Reflect.get 第三个参数 可以改变this 这里的this 指向代理对象obj
    return Reflect.get(target, key, receiver)
  },

  // 拦截设置操作
  set(target, key, newVal, receiver) {
    //先获取旧值
    const oldVal = target[key]

    //添加和修改都是通过set拦截来实现的，这里需要区分添加和修改
    //否则会造成不必要的性能开销 比如for in 循环收集的依赖，会在修改的时候触发 这是没有必要的
    const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'

    const res = Reflect.set(target, key, newVal, receiver)

    // 比较新值与旧值，只要当不全等的时候才触发响应 排除NaN
    if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
      trigger(target, key, type)
    }

    // 设置属性值
    // target[key] = newVal
    return res
  },

  //拦截 delete 操作
  deleteProperty(target, key) {
    // 检查被操作的属性是否是对象自己的属性
    const hadKey = Object.prototype.hasOwnProperty.call(target, key)

    const res = Reflect.deleteProperty(target, key)

    if (res && hadKey) {
      trigger(target, key, 'DELETE')
    }
    return res
  },

  //拦截 in 操作符
  has(target, key) {
    track(target, key)
    return Reflect.has(target, key)
  },

  //间接拦截 for in
  ownKeys(target) {
    //获取对象上属于自己的所有键值，所以这里没有key，因此我们需要自定义一个唯一的key
    track(target, ITERATE_KEY)
    //我们追踪的是 ITERATE_KEY 所以在触发的时候 也需要触发 ITERATE_KEY

    return Reflect.ownKeys(target)
  }
})
*/

//例子：1
// effect(() => {
//   //可以发现修改obj.foo 后 不会触发副作用函数，问题出在 代理 getter 中
//   console.log(obj.bar, obj.test);
//   //for in 副作用函数会与 ITERATE_KEY建议相应
//   for (const key in obj) {
//     console.log(key);
//   }
// })

//添加新值的时候，text 并没有与之对应的依赖，所以副作用函数不会执行
//所以需要做点处理
// obj.text = 2


// obj.foo = 1
// obj.test = NaN


//例子2： reactive

const obj = reactive({ foo: { bar: 1 } })
effect(() => {
  console.log(obj.foo.bar);
})

// // 修改 obj.foo.bar 的值，并不能触发响应
obj.foo.bar = 2
// //首先读取obj.foo的值  Reflect.get 返回的是一个普通对象，并没有响应式


//例子3：只读与浅只读

// const obj2 = readonly({ foo: { bar: 1 } })
// obj2.foo.bar = 2


//例子4：代理数组
const obj3 = {}

// const arr = reactive(['foo'])
const arr = reactive([obj])
effect(() => {
  // console.log('arr', arr[0]);

  // for (const key in arr) {
  //   console.log('arr for in', key);
  // }

  // for (const value of arr) {
  //   console.log('arr for of', value);
  // }


  console.log('includes', arr.includes(arr[0]));
})

// arr[1] = 'bar'
// arr.length = 0



function track(target, key) {
  if (!activeEffect) return target[key]

  //它是一个 Map 类型：key --> effects
  let depsMap = bucket.get(target)
  if (!depsMap) {
    //不存在 为此对象初始化一个
    bucket.set(target, (depsMap = new Map()))
  }

  //再根据 key 从 depsMap 中取得 deps，这是一个 Set 类型
  //里面存储着所有与当前 key 相关联的副作用函数
  let deps = depsMap.get(key)
  //如果 deps 不存在，同样新建一个 Set 与key 关联
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }

  //最后将当前激活的副作用函数添加
  deps.add(activeEffect)

  // deps 就是一个与当前副作用函数存在练习的依赖集合
  activeEffect.deps.push(deps)
}


const TriggerType = {
  SET: 'SET',
  ADD: 'ADD'
}

/**
 * 
 *  当 trigger 函数执行时，除了把那些直接与具体操作的 key 相关联的副作用函数取出来执行外，
 *  还要把那些与ITERATE_KEY 相关联的副作用函数取出来执行。 这样新添加属性 就没问题了
 *  但目前修改已有的值会存在，for in 的副作用函数也会执行
 */
function trigger(target, key, type, newVal) {
  // 把副作用函数从桶里取出并执行
  const depsMap = bucket.get(target)
  if (!depsMap) return
  //根据 key  取得所有副作用函数 effects
  const effects = depsMap.get(key)



  // const effectsToRun = new Set(effects)
  const effectsToRun = new Set()
  effects && effects.forEach((effectFn) => {

    // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，不触发执行
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn)
    }
  })

  console.log(type, key);
  //只有当操作类型为 ADD 时， 才触发 ITERATE_KEY 相关联的副作用函数
  // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun  这样 for in 就建立了联系

  if (type === 'ADD' || type === 'DELETE') {
    // 取得与 ITERATE_KEY 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 当目标对象是数组
  if (type === 'ADD' && Array.isArray(target)) {
    //取出与length 相关联的副作用函数
    const lengthEffects = depsMap.get('length')
    //讲副作用函数添加到 effectsToRun 中 等待执行
    lengthEffects && lengthEffects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 当目标对象是数组 且修改了数组的length
  if (Array.isArray(target) && key === 'length') {
    // 对于索引大于或等于新的 length 值的元素，
    // 需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
    depsMap.forEach((effects, key) => {
      console.log('key', key);
      if (key >= newVal) {
        effects.forEach(effectFn => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
      }
    })
  }


  effectsToRun.forEach(effectFn => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      // 否则直接执行副作用函数（之前的默认行为）
      effectFn()
    }
  })
}


function cleanup(effectFn) {
  //遍历 effectFn.deps 数组 依赖集合
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    // 将 effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  // 最后需要重置 effectFn.deps 数组
  effectFn.deps.length = 0
}


function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      // 代理对象可以通过 raw 属性访问原始数据
      //有了它，我们就能够在 set 拦截函数中判断 receiver 是不是target 的代理对象了：
      if (key === 'raw') {
        return target
      }

      //只有非只读情况下才需要建立响应联系
      if (!isReadonly) {
        track(target, key)
      }

      //这里直接 return  target[key] target 为 原始对象，data.bar  访问bar的时候，this指向data
      //显然在副作用函数内通过原始对象访问它的某个属性是不会建立响应联系的
      // return target[key]

      //这里使用 reflect 就能解决 Reflect.get 第三个参数 可以改变this 这里的this 指向代理对象obj
      // return Reflect.get(target, key, receiver)


      //获取原始值结果 如果是嵌套对象，这里返回的是普通对象 没有响应式
      const res = Reflect.get(target, key, receiver)

      //如果是浅响应，则直接返回原始值
      if (isShallow) {
        return res
      }

      if (typeof res === 'object' && res !== null) {
        //说明是嵌套对象 需要包装成响应式对象
        // return reactive(res)

        //这里还需要判断是否是只读 
        return isReadonly ? readonly(res) : reactive(res)
      }
      //否则目前已经是最底层属性
      return res
    },

    // 拦截设置操作
    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true
      }

      //先获取旧值
      const oldVal = target[key]

      //添加和修改都是通过set拦截来实现的，这里需要区分添加和修改
      //否则会造成不必要的性能开销 比如for in 循环收集的依赖，会在修改的时候触发 这是没有必要的
      // const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'

      const type = Array.isArray(target)
        // 小于数组长度，在修改，  大于等于说明在添加  
        ? Number(key) < target.length ? 'SET' : 'ADD'
        : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
      const res = Reflect.set(target, key, newVal, receiver)



      //当访问响应式原型上会出现性能浪费
      //这里的target 会发生变化，当访问child身上不存的属性，会去原型上去找，
      //此时的target 为 child.__proto__
      // target === receiver.raw 说明 receiver 就是 target 的代理对象
      if (target === receiver.raw) {
        // 比较新值与旧值，只要当不全等的时候才触发响应 排除NaN
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          // 增加第四个参数，即触发响应的新值
          trigger(target, key, type, newVal)
        }
      }



      // 设置属性值
      // target[key] = newVal
      // return true
      return res
    },

    //拦截 delete 操作
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true
      }



      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key)

      const res = Reflect.deleteProperty(target, key)

      if (res && hadKey) {
        trigger(target, key, 'DELETE')
      }
      return res
    },

    //拦截 in 操作符
    has(target, key) {
      track(target, key)
      return Reflect.has(target, key)
    },

    //间接拦截 for in
    ownKeys(target) {
      //获取对象上属于自己的所有键值，所以这里没有key，因此我们需要自定义一个唯一的key
      // track(target, ITERATE_KEY)
      //我们追踪的是 ITERATE_KEY 所以在触发的时候 也需要触发 ITERATE_KEY

      //如果操作目标是 数组， 则使用 length作为key 建立响应联系
      //arr[100] = 1
      //arr.length = 0  这两种都是改变了length属性
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)

      return Reflect.ownKeys(target)
    }
  })
}



function reactive(obj) {
  // const obj = {}
  // const arr = reactive([obj])
  // effect(() => {
  //   console.log('includes', arr.includes(arr[0]));  //false
  // })

  /**
   * 上面的例子   arr[0] 得到的是一个代理对象 
   *   includes 方法内部也会通过 arr 访问数组元素，从而也得到一个代理对象
   */


  // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existProxy = reactiveMap.get(obj)
  if (existProxy) return existProxy
  // 否则，创建新的代理对象
  const proxy = createReactive(obj)

  // 存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy)
  return proxy
}
function shallowReactive(obj) {
  return createReactive(obj, true)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}