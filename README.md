# ICnana 

> 面向竞赛编程（OI / ACM）的一体化桌面刷题工具

## 该项目现处于开发环节
- 实现了内部 cpp 的 IDE，语法检查实时标波浪线
- 实现了多个样例的测试，可以添加和删除；
- 样例绑定到文件，切换文件样例不会丢失；
- 接入了 Competitive Companion，可以从浏览器上直接爬取样例到 ICnana
- 拉取题目信息，渲染到 ICnana 中
  (目前支持的有：洛谷，codeforces，atcoder)
- 拉取的题目会按链接自动归到对应的 OJ 分组（洛谷 / Codeforces / AtCoder / 牛客）；
- 收藏夹：内置「收藏」加自建集合，同一道题可以同时放进多个集合；
- 交互题自测：支持 testlib 交互器、普通写法交互器，以及没有交互器时的手动对答
- 编译环境可配：C++ 标准、优化等级、静态链接，语法检查跟着同一套参数走
- 本地评测：时间限制读题目元数据，Windows 上强制内存限制；超时 / 超内存 / 运行时错误分别标记
- 每个用例会显示本次耗时和峰值内存（Windows 才有内存数据）
- 界面可换肤：壁纸背景、半透明玻璃面板、圆角、玻璃与标题栏配色都能在设置里调
- 代码配色三套预设（高对比 / 柔和 / 单色），每类语法元素还能单独改色
- 自绘标题栏（Windows / Linux），支持拖动、双击最大化、边缘拉伸
- Windows 安装包内置 GCC，装完即用

### 接下来打算实现的有

- **1.2.0**：通讯题自测、样例数据生成器、并发测评
- OJ 适配做成插件（丢一个 json 就能加新 OJ）
- 题面解析补齐：牛客抓取、洛谷换成 `content-only` 接口
- 有历史题目的查询
- 可以通过 ICnana 提交代码到 oj 上，返回测评结果
- 若是可以，将 Competitive Companion 内置到 ICnana 中

## 须知
Windows 安装包已经内置 GCC（MinGW 15），装完即用；Linux / macOS 仍然依赖系统里的 `g++`（deb / rpm 包会声明依赖，装包时自动带上）。
Windows 首次启动会把内置工具链解压到程序目录，约 500MB、需要 20–40 秒，之后不再重复。

题目、样例、收藏夹放在哪，取决于安装目录能不能写：

- 装到可写目录（安装时自己选的、或解压版）→ 数据就在程序旁边：
  ```
  icnana/
    ├── icnana.exe
    ├── workspace/     （题目、样例、收藏夹）
    └── toolchain/     （首启解压出来的 GCC）
  ```
  整个文件夹拷到别的电脑就能接着用。
- 装到只读目录（`Program Files`、`/usr/lib`）→ 回落到系统数据目录：
  - Windows：`%APPDATA%\com.icnana\workspace`
  - Linux：`~/.local/share/com.icnana/workspace`
  - macOS：`~/Library/Application Support/com.icnana/workspace`

设置页的「存储」一栏会直接显示当前实际路径，换机器时备份这个文件夹即可。
老版本留在启动目录旁边的 `../workspace` 会在第一次启动时自动迁移过来。


## 搭配 Competitive Companion 使用（这个插件是必要的）
[Competitive Companion](https://github.com/jmerle/competitive-companion) 是一个浏览器插件，可以直接从 OJ 题目页发送样例数据。

配置方式：
1. 安装插件（[Chrome](https://chromewebstore.google.com/detail/competitive-companion/cjnmckjndlpiamhfimnnjmnckgghkjbl) / [Firefox](https://addons.mozilla.org/en-US/firefox/addon/competitive-companion/)）
2. 插件设置 → Custom port → 填写 `10043`
3. 在题目页点击插件图标(一个➕)，ICnana 将自动填入题目与样例
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
    |--.wsindex.json      （扫描缓存，自动维护，删了会重新生成）
    |--题目文件夹1
    |   |--cases.json     （样例文件，含输入/输出/实际输出/状态/耗时）
    |   |--main.cpp       （cpp代码源文件）
    |   |--main.bin       （编译后的二进制文件）
    |   |--question.json  （题目信息，含 oj / problemType / 时间内存限制）
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
## 3.收藏夹与 OJ 归类：
  拉取题目时按 url 判断来源，自动归进对应的 OJ 分组；也可以手动把题目加入自建集合。
  收藏夹只保存题目文件夹名的引用，删题、改名时会自动同步，不会留下打不开的条目;
## 4.本地评测：
  时间限制读 `question.json`，在标签行里点一下 `3000 ms` 就能改，改完立刻生效；
  内存限制在 Windows 上强制（超出判 MLE 并杀进程），Linux / macOS 暂不强制，避免误伤;
  程序崩溃不会再显示成「输出为空」，非零退出码会判 RE 并给出信号说明;
  多个用例并行跑（每批最多 4 个），同时显示每个用例的耗时和峰值内存;
## 5.交互题自测：
  在「交互器」标签页里粘贴题目给的交互器源码就能自测，支持 testlib 写法（`registerInteraction`）和普通 cin/cout 写法，testlib.h 已经内置，不用自己准备;
  没有交互器的题（Codeforces 一类）用「手动对答」：程序输出实时显示，自己敲输入扮演交互器;
  判定看交互器退出码（0 通过），双向交互流水会完整显示出来，方便查是哪一轮说岔了;
## 6.编译环境：
  设置里可以选 C++14/17/20/23、优化等级、是否静态链接；默认 `-std=c++17 -O2 -static`;
  本地不定义 `ONLINE_JUDGE`，避免选手代码里的 `#ifdef` 分支走反;
  Windows 优先用内置 GCC；安装路径或题目名带中文时会转成短路径再交给编译器，避免 MinGW 读不了非 ASCII;
  没有编译器时首启会有提示横幅，点进去直接看安装方法;
## 7.界面与主题：
  背景可以放本地图片或 http 链接，面板是半透明玻璃，圆角、玻璃颜色、模糊、整体压暗都能调;
  左右两栏四个角可以单独切成直角或圆角，标题栏有自己的颜色 / 透明度 / 雾化;
  代码区不铺底色，语法配色有三套预设，每一类元素（注释、关键字、字符串…）还能单独改色;
  壁纸太花时可以调「文字描边」，代码和终端都有描边，终端里输入 / 输出 / 系统提示的颜色也能单独设;
  标题栏是自绘的，支持拖动、双击最大化、边缘拉伸;
## 8.示范题：
  `examples/` 下有三个可以直接导入的交互题样板：手动对答、testlib 单值猜数、矩阵猜排列。
## 9.题目提交（尚未实现）：
  计划是检测对应 oj 的历史 cookies，没有就弹出登录界面，登录后保存 cookies 复用，失效则重新登录；

---

# 开发相关
- 前端：React 19 + TypeScript + Vite，编辑器是 Monaco（走本地资源，断网也能用）
- 后端：Tauri v2 + Rust
- 目录：`src/` 前端，`src-tauri/src/` 后端（command / compiler / oj / utils），`scripts/` 构建辅助
- 版本号用 `npm run version:bump <x.y.z>` 同步五处文件，`npm run version:check` 检查是否一致
- 测试：`cd src-tauri && cargo test --lib`；前端类型检查 `npx tsc --noEmit`
- 发版：`git tag v1.1.2 && git push origin v1.1.2` 触发 GitHub Actions（Windows job 会下载 winlibs GCC 15 打进安装包）
