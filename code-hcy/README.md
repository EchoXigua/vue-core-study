## 1. tree-shaking

```
 npx rollup input.js  -f esm -o bundle.js
```



可以发现在打包后的 bundle.js 中并不包含 bar 函数，这说明 tree-shaking 起作用了

但其实foo函数的执行也没有什么意义，为什么rolllup不移除呢？

> 如果一个函数调用会产生副作用，那么就不能将其移除。



那我们知道此处的代码不会有任何效果，怎么移除呢？

```js
/*#__PURE__* /   在函数前面加上这个，告诉rollup 这个函数不会产生副作用，可以放心的tree-shaking
```





