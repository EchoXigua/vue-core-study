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

const data = { foo: 1, bar: 2 }

const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    track(target, key)

    return target[key]
  },

  // 拦截设置操作
  set(target, key, newVal) {
    // 设置属性值
    target[key] = newVal

    trigger(target, key)

    return true
  }
})

watch(obj, (newValue, oldValue) => {
  console.log('数据变化了', newValue, oldValue);
  console.log(newValue === oldValue);
}, { immediate: true })
obj.foo++

/**
 * 
 *    watch(obj,() => {
 *      console.log('obj change');
 *    })
 * 
 *    watch(
 *      () => obj.foo,
 *      () => {
 *        console.log('obj.foo 的值变了')
 *      }
 *    )
 * 
 * 
 */

function watch(source, cb, options = {}) {
  let getter

  // 如果 source 是函数，说明用户传递的是 getter，所以直接把 source 赋值给 getter
  if (typeof source === 'function') {
    getter = source
  } else {
    // 否则按照原来的实现调用 traverse 递归地读取
    getter = () => traverse(source)
  }

  let oldValue, newValue

  // 提取 scheduler 调度函数为一个独立的 job 函数
  const job = () => {
    newValue = effectFn()
    cb(newValue, oldValue)
    oldValue = newValue

  }


  // 使用 effect 注册副作用函数时，开启 lazy 选项，并把返回值存储到effectFn 中以便后续手动调用
  const effectFn = effect(
    //执行 getter
    () => getter(),
    {
      lazy: true,
      // 使用 job 函数作为调度器函数
      scheduler: job,


      // scheduler() {
      //   // 在 scheduler 中重新执行副作用函数，得到的是新值
      //   newValue = effectFn()

      //   // 将旧值和新值作为回调函数的参数
      //   cb(newValue, oldValue)

      //   // 更新旧值，不然下一次会得到错误的旧值
      //   oldValue = newValue
      // },
    }
  )

  if (options.immediate) {
    // 当 immediate 为 true 时立即执行 job，从而触发回调执行
    job()

    /**
     *  由于回调函数是立即执行的，所以第一次回调执行时没有所谓的旧值，因此此时回调函数的
     *  oldValue 值为 undefined，这也是符合预期的
     */

  } else {
    oldValue = effectFn()
  }

  // // 手动调用副作用函数，拿到的值就是旧值
  // oldValue = effectFn()



  //下面代码只处理了 source 是响应式对象

  // effect(
  //   //这里使用了硬编码，我们需要封装一个通用的读取操作
  //   // () => source.foo,
  //   () => {
  //     console.log(traverse(source));
  //   },

  //   {
  //     //传入配置项 调度器后，数据发生变化，会执行调度器
  //     scheduler() {
  //       //数据发生变化时，调用 回调函数cb
  //       cb()
  //     }
  //   }
  // )
}


//递归读取属性    这样就能读取一个对象上的任意属性
function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
  if (typeof value !== 'object' || value === null || seen.has(value)) return

  // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value)

  // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const k in value) {
    //在这里遍历的时候 读取对象上的每个值 触发 track
    traverse(value[k], seen)
  }
  return value
}









//拿到副作用的返回值
const effectFn = effect(function () {
  console.log(obj.foo)
  return 123
},
  //options 
  //实现一个lazy 懒加载
  {
    lazy: true
  }
)
//手动去执行副作用函数,但是手动执行，意义并不大。。但如果我们
//把传递给 effect 的函数看作一个 getter，那么这个 getter 函数可以返回任何值 我们需要改造effect
const value = effectFn()
console.log(value);


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

function trigger(target, key) {

  // 把副作用函数从桶里取出并执行
  const depsMap = bucket.get(target)
  if (!depsMap) return
  //根据 key  取得所有副作用函数 effects
  const effects = depsMap.get(key)

  // const effectsToRun = new Set(effects)
  const effectsToRun = new Set()
  effects.forEach((effectFn) => {

    // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，不触发执行
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn)
    }
  })

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