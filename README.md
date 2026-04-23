# ICnana 🐱

> 面向竞赛编程（OI / ACM）的一体化桌面刷题工具

ICnana 把 **代码编辑、本地编译评测、OJ 题目浏览与一键提取** 整合进同一个窗口，让你刷题时再也不用在浏览器和编辑器之间来回切换。

---

## ✨ 功能介绍

### 💻 代码实验室

- **多文件管理**：左侧文件栏可新建、重命名、删除多个 `.cpp` 文件，切换时自动保存
- **Monaco 编辑器**：VS Code 同款编辑器，C++ 语法高亮，**实时波浪线错误提示**（边写边检查，无需手动编译）
- **一键运行全部样例**：点击"▶ 运行全部样例"，自动编译并对所有测试用例批量评测，结果以 **AC / WA / Error** 标注

### 🌐 OJ 浏览器

- 内置浏览器，可直接在 ICnana 内浏览 OJ 题目页，无需切换窗口
- **⚡ 一键提取题目**：在题目页点击"提取题目"，样例输入输出自动填入测试面板，支持：
  - Codeforces
  - 洛谷
  - AtCoder
  - Vjudge 及其他主流 OJ

### ⚙️ 个性化设置

- 自定义**新建文件的代码模板**（点击顶栏 ⚙️ 按钮）
- 自定义**缩进大小**（2 或 4 空格）
- 快捷收藏夹：在顶栏保存常用 OJ 链接，右键可删除

---

## 📥 安装

前往 [Releases](https://github.com/Argklles/icnana/releases) 页面下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| Windows | `.msi` 或 `.exe` 安装程序 |
| Linux（Debian / Ubuntu） | `.deb` 安装包 |
| Linux（通用） | `.AppImage`（无需安装，直接运行） |

> ⚠️ **运行前提**：本机需要安装 `g++`（用于编译你的代码）
>
> ```bash
> # Ubuntu / Debian
> sudo apt install g++
>
> # Windows：推荐安装 MinGW-w64 或 MSYS2
> ```

---

## 🔌 搭配 Competitive Companion 使用（可选）

[Competitive Companion](https://github.com/jmerle/competitive-companion) 是一个浏览器插件，可以直接从 OJ 题目页发送样例数据。

配置方式：
1. 安装插件（[Chrome](https://chromewebstore.google.com/detail/competitive-companion/cjnmckjndlpiamhfimnnjmnckgghkjbl) / [Firefox](https://addons.mozilla.org/en-US/firefox/addon/competitive-companion/)）
2. 插件设置 → Custom port → 填写 `10043`
3. 在题目页点击插件图标，ICnana 将自动弹出并填充测试用例

---

## 📜 License

MIT
