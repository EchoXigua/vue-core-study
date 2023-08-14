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

const sumRes = computed(() => {
  console.log('computed exec');
  return obj.foo + obj.bar
})

//多次访问 sumRes.value 的值，每次访问都会调用 effectFn 重新计算。所以需要添加缓存
// console.log(sumRes.value);
// console.log(sumRes.value);
// console.log(sumRes.value);


// obj.foo++
// console.log(sumRes.value);

effect(() => {
  // 在该副作用函数中读取 sumRes.value
  console.log(sumRes.value);
})
// 修改 obj.foo 的值
obj.foo++

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


//现在我们可以实现一个computed函数了

function computed(getter) {
  //添加缓存功能  用value 来缓存上一次计算的值
  let value
  // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着“脏”，需要计算

  let dirty = true

  // 把 getter 作为副作用函数，创建一个 lazy 的 effect
  const effectFn = effect(getter, {
    lazy: true,
    //当值发生变化的时候 在调度器中将 dirty 重置为 true
    scheduler() {
      if (!dirty) {
        dirty = true
        // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发相应
        trigger(obj, 'value')
      }
    }
  })

  const obj = {
    // 当读取 value 时才执行 effectFn
    get value() {
      if (dirty) {
        value = effectFn()
        // 将 dirty 设置为 false，下一次访问直接使用缓存到 value 中的值
        dirty = false
      }
      // 当读取 value 时，手动调用 track 函数进行追踪
      track(obj, 'value')
      return value
    }
  }

  return obj
}



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