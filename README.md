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
- 拉取的题目会按链接自动归到对应的 OJ 分组（洛谷 / Codeforces / AtCoder / 牛客）;
- 收藏夹：内置「收藏」加自建集合，同一道题可以同时放进多个集合;
- 交互题自测：支持 testlib 交互器、普通写法交互器，以及没有交互器时的手动对答
- 编译环境可配：C++ 标准、优化等级、静态链接，语法检查跟着同一套参数走

### 接下来打算实现的有

- 有历史题目的查询
- 可以通过ICnana提交代码到oj上，返回测评结果
- 内置一个数据生成器
- 美化美化美化美化美化美化
- 若是可以，将Competitive Companion内置到ICnana中
- 内置 gcc 环境，免去自己装编译器

## 须知
需要自行下载gcc编译环境（内置工具链还在做，当前版本仍然依赖系统里的 g++）

题目、样例、收藏夹都存在系统的应用数据目录里，不在安装目录：
- Windows：`%APPDATA%\com.icnana\workspace`
- Linux：`~/.local/share/com.icnana/workspace`
- macOS：`~/Library/Application Support/com.icnana/workspace`

设置页的「存储」一栏会直接显示当前路径，换机器时备份这个文件夹就行。
老版本留在启动目录旁边的 `../workspace` 会在第一次启动时自动迁移过来。


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
  - 牛客（目前只拉样例，题面解析还没做）
  - 其他主流 OJ
---

## 工作区文件格式：
```
  workspace
    |--collections.json   （收藏夹/集合索引，只存题目文件夹名）
    |--.code_template.cpp （新建文件用的代码模板）
    |--题目文件夹1
    |   |--cases.json     （样例文件）
    |   |--main.cpp       （cpp代码源文件）
    |   |--main.bin       （编译后的二进制文件）
    |   |--question.json  （题目信息，含 oj / problemType 等）
    |   |--question.md    （题目文本）
    |   |--interactor.cpp （交互题的交互器，可选）
    |   |--interactor.bin （交互器编译产物）
    |   |--interactive.in （交互自测时作为 argv[1] 的测试数据）
    |--题目文件夹2
    |...
```


# 项目功能介绍：
## 1.样例拉取：
  配合使用了Competitive Companion(下面统称cc)插件，将oj题目上的：标题（name）,赛次（group），题目连接（url），时间限制（timelimit），空间限制（memorylimit）打包发送给端口：127.0.0.1:10043
  然后进入后端开始解析,将内容保存本地;
## 2.题目拉取 :
  检测cc插件拉取行为,如果拉取成功,将url解析后判断是哪一种oj;静默打开对应题目的链接,然后调用api或者拉取html然后解析成markdown文件保存本地;
## 3.题目提交:
  打开软件后会检测是否有对应oj的历史cookies;若没有,会在提交的时候弹出一个用户登陆的界面通过ai检测;然后将cookies保存本地以便每一次调用,若是cookies失效,则让用户重新登录;
## 4.收藏夹与 OJ 归类：
  拉取题目时按 url 判断来源，自动归进对应的 OJ 分组；也可以手动把题目加入自建集合。
  收藏夹只保存题目文件夹名的引用，删题、改名时会自动同步，不会留下打不开的条目;
## 5.交互题自测：
  在「🔀 交互器」标签页里粘贴题目给的交互器源码就能自测，支持 testlib 写法（`registerInteraction`）和普通 cin/cout 写法，testlib.h 已经内置，不用自己准备;
  没有交互器的题（Codeforces 一类）用「手动对答」：程序输出实时显示，自己敲输入扮演交互器;
  判定看交互器退出码（0 通过），双向交互流水会完整显示出来，方便查是哪一轮说岔了;
## 6.编译环境：
  设置里可以选 C++14/17/20/23、优化等级、是否静态链接；默认 `-std=c++14 -O2 -static`，对齐洛谷（GCC 15.3）和 NOI Linux 2.0 的口径;
  本地不定义 `ONLINE_JUDGE`，避免选手代码里的 `#ifdef` 分支走反;
## 7.示范题：
  `examples/` 下有三个可以直接导入的交互题样板：手动对答、testlib 单值猜数、矩阵猜排列。
