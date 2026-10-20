# 内置工具链目录

这个目录在**构建时**由 CI 填充，仓库里只放这个占位说明。

- Windows 构建：`.github/workflows/release.yml` 会下载 winlibs 的 GCC 15.x（x86_64 / posix / ucrt）
  并解压到这里，随后由 Tauri 打进安装包。
- Linux / macOS：不打内置工具链（体积和 glibc 兼容性都不划算），
  依赖系统 `g++`：deb 已声明 `Depends: g++`。

运行时查找顺序：

1. 环境变量 `ICNANA_GXX`
2. `<resource_dir>/resources/toolchain/bin/g++`（打包后的位置）
3. `<exe 目录>/resources/toolchain/bin/g++`（开发期）
4. 系统 PATH 里的 `g++`

手动放一份工具链到这里（例如开发期想验证内置路径），结构应为：

```
resources/toolchain/
  bin/g++.exe
  include/
  lib/
  libexec/
```
