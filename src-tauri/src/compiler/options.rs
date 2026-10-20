//! C++ 编译参数配置。
//!
//! 目标：本地编译行为尽量贴着在线评测机，避免“本地 AC、上线 TLE”这类假象。
//! 参考：
//!   洛谷       `g++ -x c++ -std=$version -O2 -fPIC -DONLINE_JUDGE -Wall -fno-asm -lm -march=native`（GCC 15.3.0）
//!   NOI Linux   GCC 9.3.0 + C++14
//!
//! 刻意 **不** 定义 `ONLINE_JUDGE`：不少选手用 `#ifdef ONLINE_JUDGE` 控制文件重定向或调试输出，
//! 本地定义会让分支走反，属于“本地能过、交上去挂”的经典坑。

use serde::{Deserialize, Serialize};
use std::env;

/// 默认 C++ 标准：C++17 是现在大多数 OJ / 比赛的主流档位，
/// 也能覆盖洛谷（GCC 15.3）和 Codeforces（GCC 14.2）的常规用法。
pub const DEFAULT_STD: &str = "c++17";

/// 默认优化等级。评测机默认开 O2，本地不开会让选手误判常数与复杂度。
pub const DEFAULT_OPT: &str = "O2";

/// 设置页可选的 C++ 标准（与前端 STD_CHOICES 保持一致）。
pub const STD_CHOICES: [&str; 4] = ["c++14", "c++17", "c++20", "c++23"];

/// 前端设置面板传来的编译设置；字段全部可选，缺省即沿用默认 / 环境变量。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileSettings {
    pub std: Option<String>,
    pub opt: Option<String>,
    pub static_link: Option<bool>,
    pub march_native: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct CompileOptions {
    /// 例如 `c++17`
    pub std: String,
    /// 只有优化等级，例如 `O2`（拼成 `-O2`）
    pub opt: String,
    /// 静态链接。Windows 上默认开启，否则用户二进制会依赖工具链的 DLL。
    pub static_link: bool,
    /// 是否带 `-Wall`
    pub warnings: bool,
    /// 是否加 `-march=native`。默认关闭，避免用上评测机没有的指令集。
    pub march_native: bool,
}

impl Default for CompileOptions {
    fn default() -> Self {
        Self {
            std: DEFAULT_STD.to_string(),
            opt: DEFAULT_OPT.to_string(),
            // macOS 不支持 -static，只有 Windows / Linux 默认开
            static_link: cfg!(any(target_os = "windows", target_os = "linux")),
            warnings: true,
            march_native: false,
        }
    }
}

impl CompileOptions {
    /// 临时配置入口：设置页做好之前，先用环境变量覆盖。
    ///   ICNANA_CPP_STD      = c++17
    ///   ICNANA_OPT_LEVEL    = O0 / O1 / O2 / O3
    ///   ICNANA_MARCH_NATIVE = 1
    pub fn from_env() -> Self {
        let mut opts = Self::default();
        if let Ok(v) = env::var("ICNANA_CPP_STD") {
            if STD_CHOICES.contains(&v.as_str()) {
                opts.std = v;
            }
        }
        if let Ok(v) = env::var("ICNANA_OPT_LEVEL") {
            if let Some(normalized) = Self::normalize_opt(&v) {
                opts.opt = normalized;
            }
        }
        if let Ok(v) = env::var("ICNANA_MARCH_NATIVE") {
            opts.march_native = v == "1" || v.eq_ignore_ascii_case("true");
        }
        opts
    }

    /// 归一化优化等级：接受 `O2` / `-O2` / `2`，最终只保留 `2`。
    fn normalize_opt(raw: &str) -> Option<String> {
        let v = raw
            .trim()
            .trim_start_matches('-')
            .trim_start_matches('O')
            .to_string();
        matches!(v.as_str(), "0" | "1" | "2" | "3" | "s").then_some(v)
    }

    /// 前端设置优先；没传的字段回落到环境变量 / 默认值。
    pub fn from_settings(settings: Option<CompileSettings>) -> Self {
        let mut opts = Self::from_env();
        if let Some(s) = settings {
            if let Some(v) = s.std {
                if STD_CHOICES.contains(&v.as_str()) {
                    opts.std = v;
                }
            }
            if let Some(v) = s.opt {
                if let Some(normalized) = Self::normalize_opt(&v) {
                    opts.opt = normalized;
                }
            }
            if let Some(v) = s.static_link {
                opts.static_link = v;
            }
            if let Some(v) = s.march_native {
                opts.march_native = v;
            }
        }
        opts
    }

    fn common_args(&self) -> Vec<String> {
        // opt 既可能是 "2" 也可能是 "O2"，统一归一化后再拼，避免出现 -OO2
        let opt = Self::normalize_opt(&self.opt).unwrap_or_else(|| "2".to_string());
        let mut args = vec![format!("-std={}", self.std), format!("-O{opt}")];
        if self.warnings {
            args.push("-Wall".to_string());
        }
        args.push("-fno-asm".to_string());
        args.push("-pipe".to_string());
        if self.march_native {
            args.push("-march=native".to_string());
        }
        args
    }

    /// 完整编译用的参数（不含源文件与 -o）。
    pub fn compile_args(&self) -> Vec<String> {
        let mut args = self.common_args();
        if self.static_link {
            args.push("-static".to_string());
        }
        args
    }

    /// 语法检查用的参数（`-fsyntax-only`，不需要链接，因此不带 -static）。
    pub fn syntax_args(&self) -> Vec<String> {
        let mut args = vec!["-fsyntax-only".to_string()];
        args.extend(self.common_args());
        args
    }
}
