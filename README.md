# ICnana 

> 面向竞赛编程（OI / ACM）的一体化桌面刷题工具

## 现在能做什么
- 内部 cpp IDE，语法检查实时标波浪线，样例绑定文件、切换不丢
- 接 Competitive Companion，浏览器上点一下就把题目和样例拉进来
- 按 url 自动归档到 OJ 分组，另有「收藏」与自建集合
- 交互题自测：testlib / 普通交互器 / 手敲输入扮演交互器
- 本地评测：时间限制读题目元数据，Windows 强制内存限制，每例显示耗时与峰值内存
- 界面可换肤：壁纸、玻璃面板、圆角、代码配色、自绘标题栏

### 接下来打算实现的有
- **1.2.0**：通讯题自测、样例数据生成器、并发测评
- OJ 适配做成插件（丢一个 json 就能加新 OJ）
- 题面解析补齐：牛客抓取、洛谷换成 `content-only` 接口
- 有历史题目的查询；把代码提交到 OJ 并取回结果
- 若是可以，将 Competitive Companion 内置到 ICnana 中

## 安装与数据
- **Windows**：安装包内置 GCC（MinGW 15），装完即用；首次启动解压工具链到程序目录，约 500MB、20–40 秒
- **Linux / macOS**：依赖系统 `g++`（deb / rpm 会声明依赖，装包时自动带上）

题目、样例、收藏夹的位置取决于安装目录能不能写：

- 装到可写目录（安装时自己选的、或解压版）→ 数据在程序旁边，`workspace/` 和 `toolchain/`，整个文件夹可拷走
- 装到只读目录（`Program Files`、`/usr/lib`）→ 回落到系统数据目录：Windows `%APPDATA%\com.icnana\workspace`，Linux `~/.local/share/com.icnana/workspace`

设置页的「存储」一栏会显示当前实际路径。老版本留在启动目录旁边的 `../workspace` 会在第一次启动时自动迁移。

## 搭配 Competitive Companion 使用（这个插件是必要的）
[Competitive Companion](https://github.com/jmerle/competitive-companion) 是一个浏览器插件，可以直接从 OJ 题目页发送样例数据。

配置方式：
1. 安装插件（[Chrome](https://chromewebstore.google.com/detail/competitive-companion/cjnmckjndlpiamhfimnnjmnckgghkjbl) / [Firefox](https://addons.mozilla.org/en-US/firefox/addon/competitive-companion/)）
2. 插件设置 → Custom port → 填写 `10043`
3. 在题目页点击插件图标(一个➕)，ICnana 将自动填入题目与样例

支持：Codeforces / 洛谷 / AtCoder / 牛客（目前只拉样例）/ 其他主流 OJ

---

## 工作区文件格式：
```
  workspace
    |--collections.json   （收藏夹索引，只存题目文件夹名）
    |--.code_template.cpp （新建文件用的代码模板）
    |--.wsindex.json      （扫描缓存，可删，会自动重建）
    |--题目文件夹/
        |--cases.json     （样例：输入 / 输出 / 实际输出 / 状态 / 耗时）
        |--main.cpp       （源码）
        |--main.bin       （编译产物）
        |--question.json  （题目信息：oj / problemType / 时间内存限制）
        |--question.md    （题面）
        |--interactor.cpp / interactor.bin / interactive.in （交互题才有的三件套）
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
  程序崩溃不会显示成「输出为空」，非零退出码判 RE 并给出信号说明;
  多个用例并行跑，并发数在「编译环境」里可选（1/2/4/6/8，自动夹到 CPU 核数），每例显示耗时与峰值内存;
  单个用例输出超过 1MB 会截断并判 WA，避免界面被海量输出拖死;
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

---

# 开发相关
- 前端：React 19 + TypeScript + Vite，编辑器 Monaco（走本地资源，断网可用）
- 后端：Tauri v2 + Rust；`src/` 前端，`src-tauri/src/` 分 command / compiler / oj / utils，`scripts/` 构建辅助
- 命令：`npm run tauri dev`（开发）、`npm run build`（前端产物，含 Monaco 拷贝与字体剪枝）、`npm run build:linux`（deb/rpm）
- 测试：`cd src-tauri && cargo test --lib`；`npx tsc --noEmit`
- 版本：`npm run version:bump <x.y.z>` 同步五处，`npm run version:check` 检查一致性
- 发版：`git tag v<x.y.z> && git push origin v<x.y.z>` 触发 GitHub Actions
