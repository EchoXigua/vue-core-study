function render(vnode, container) {
  const el = document.createElement(vnode.tag)
  //遍历vnode.props 将属性、事件添加到 DOM元素
  for (const key in vnode.props) {
    if (/^on/.test(key)) {
      //以on开头的
      el.addEventListener(
        key.substring(2).toLowerCase(), vnode.props[key]
      )
    }
  }
  // 处理 children
  if (typeof vnode.children === 'string') {
    // 如果 children 是字符串，说明它是元素的文本子节点

    el.appendChild(document.createTextNode(vnode.children))
  } else if (Array.isArray(vnode.children)) {
    // 递归地调用 renderer 函数渲染子节点，使用当前元素 el 作为挂载点

    vnode.children.forEach(child => renderer(child, el))
  }
  // 将元素添加到挂载点下
  container.appendChild(el)
}