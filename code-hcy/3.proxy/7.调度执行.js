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

function effect(fn, options) {

  const effectFn = () => {
    // 调用 cleanup 函数完成清除工作  
    cleanup(effectFn)

    // 当调用 effect 注册副作用函数时，将副作用函数 fn 赋值给 activeEffect
    activeEffect = effectFn

    // 在调用副作用函数之前将当前副作用函数压入栈内
    effectStack.push(effectFn)
    fn()

    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
  }

  // 将 options 挂载到 effectFn 上
  effectFn.options = options // 新增

  effectFn.deps = []
  //执行副作用函数
  effectFn()
}

const data = { foo: 1 }

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




//我们想要改变代码执行顺序 但不改变代码 可以通过调度器来执行 

// effect(function () {
//   console.log(obj.foo)
// },
//   //options
//   {
//     // scheduler(fn) {
//     //   // 将副作用函数放到宏任务队列中执行
//     //   setTimeout(fn)
//     // }
//   }
// )

// obj.foo++

// console.log('结束了');

//我们想要改变代码执行顺序 但不改变代码 可以通过调度器来执行 还可以控制执行次数

// 显然 obj.foo 一定会从1 自增到 3，那么执行三次打印时多余的
//我们可以基于调度器很容i实现此功能



const jobQueue = new Set()  // Set 数据结构的自动去重能力。
// 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve()
// 一个标志代表是否正在刷新队列
let isFlushing = false
function flushJob() {
  // 如果队列正在刷新，则什么都不做
  if (isFlushing) return

  // 设置为 true，代表正在刷新
  isFlushing = true
  // 在微任务队列中刷新 jobQueue 队列
  p.then(() => {
    jobQueue.forEach(job => job())
  }).finally(() => {
    // 结束后重置 isFlushing
    isFlushing = false
  })
}

effect(function () {
  console.log(obj.foo)
},
  //options
  {
    scheduler(fn) {
      // 将副作用函数放到宏任务队列中执行
      jobQueue.add(fn)
      flushJob()
    }
  }
)

obj.foo++
obj.foo++

/*  这个功能有点类似于在 Vue.js 中连续多次
    修改响应式数据但只会触发一次更新，实际上 Vue.js 内部实现了一个
    更加完善的调度器，思路与上文介绍的相同。
*/



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