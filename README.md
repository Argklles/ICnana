# ICnana 

> 面向竞赛编程（OI / ACM）的一体化桌面刷题工具

## 该项目现处于开发环节
- 实现了内部cpp的IDE
- 实现了多个样例的测试，可以添加和删除;
- 样例绑定到文件，切换文件样例不会丢失;
- 接入了Competitive Companion，可以从浏览器上直接爬去样例到ICnana
- 测评本地样例
- 拉取题目信息，显示在编译区上方
- 将题目渲染到ICnana中
  (目前支持的有：洛谷，codeforce, atcode)

### 接下来打算实现的有

- 有历史题目的查询
- 可以通过ICnana提交代码到oj上，返回测评结果
- 内置一个数据生成器
- 美化美化美化美化美化美化
- 若是可以，将Competitive Companion内置到ICnana中

## 须知
需要自行下载gcc编译环境


## 搭配 Competitive Companion 使用（这个插件是必要的）
[Competitive Companion](https://github.com/jmerle/competitive-companion) 是一个浏览器插件，可以直接从 OJ 题目页发送样例数据。

配置方式：
1. 安装插件（[Chrome](https://chromewebstore.google.com/detail/competitive-companion/cjnmckjndlpiamhfimnnjmnckgghkjbl) / [Firefox](https://addons.mozilla.org/en-US/firefox/addon/competitive-companion/)）
2. 插件设置 → Custom port → 填写 `10043`
3. 在题目页点击插件图标(一个➕)，ICnana 将自动弹出并填充测试用例
支持：
  - Codeforces
  - 洛谷
  - AtCoder
  - 其他主流 OJ
---

## 工作区文件格式：
  workspace
    |--题目文件夹1
    |   |--cases.json   （样例文件）
    |   |--main.cpp     （cpp代码源文件）
    |   |--main.bin     （编译后的二进制文件）
    |   |--question.json（题目信息）
    |   |--question.md  （题目文本）
    |--题目文件夹2
    |...