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

function effect(fn) {

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

  effectFn.deps = []
  //执行副作用函数
  effectFn()
}

const data = { text: 'hello world', ok: true, foo: true, bar: true, num: 1 }

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

obj.ok = false
// obj.text = 'hello vue3'

// 执行副作用函数，触发读取
// effect(() => {
//   console.log('effect run')
//   // document.body.innerText = obj.text
//   document.body.innerText = obj.ok ? obj.text : 'not'
// })

//嵌套 effect
effect(function effectFn1() {
  console.log('effectFn1 执行')

  effect(function effectFn2() {
    console.log('effectFn2 执行')
    // 在 effectFn2 中读取 obj.bar 属性
    temp2 = obj.bar
  })
  // 在 effectFn1 中读取 obj.foo 属性
  temp1 = obj.foo

  //会导致栈溢出
  //该副作用函数正在执行中，还没有执行完毕，就要开始下一次的执
  //行。这样会导致无限递归地调用自己，于是就产生了栈溢出。
  // obj.num++   //->>   obj.num = obj.num + 1  会触发 get  set
})

obj.foo = 123
obj.bar = 123

// // 1 秒后修改响应式数据
// setTimeout(() => {
//   // obj.text = 'hello vue3'
//   obj.notExist = 'hello vue3'

//   obj.text = 'hello vue3'
// }, 1000)





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

  effectsToRun.forEach(effectFn => effectFn())
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