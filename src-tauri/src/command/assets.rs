use std::fs;
use std::path::Path;

/*
    背景图读取。

    不走 asset 协议（权限、路径转义、dev/prod 行为都不一样，容易踩坑），
    直接由 Rust 读文件转成 data URL 交给前端，最省事也最可靠。
*/

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// 把用户填的地址规整成真实路径：
///   file:///home/a.png  → /home/a.png
///   file:///C:/a.png    → C:/a.png      （Windows）
///   /home/a%20b.png     → /home/a b.png （URL 百分号编码）
pub fn normalize_path(raw: &str) -> String {
    let trimmed = raw.trim();
    let mut p = match trimmed.strip_prefix("file://") {
        Some(rest) => percent_decode(rest),
        None => trimmed.to_string(),
    };

    if cfg!(windows) {
        let bytes = p.as_bytes();
        if bytes.len() >= 3 && bytes[0] == b'/' && bytes[2] == b':' {
            p.remove(0);
        }
    }

    p
}


/// 把本地图片读成原始字节。
/// 前端拿到 ArrayBuffer 后拼 Blob URL，比 base64 data URL 省内存
/// （data URL 会把一张 4K 图变成 ~10MB 的字符串常驻）。
#[tauri::command]
pub fn read_image_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let cleaned = normalize_path(&path);
    let p = Path::new(&cleaned);

    let meta = fs::metadata(p).map_err(|e| format!("读不到这个文件（{cleaned}）：{e}"))?;
    if !meta.is_file() {
        return Err("这是个目录，不是图片".to_string());
    }
    if meta.len() > 32 * 1024 * 1024 {
        return Err("图片太大了（超过 32MB），换张小点的吧".to_string());
    }

    let bytes = fs::read(p).map_err(|e| format!("读取失败：{e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_file_url_and_encoding() {
        assert_eq!(normalize_path("/home/a.png"), "/home/a.png");
        assert_eq!(normalize_path("file:///home/a.png"), "/home/a.png");
        assert_eq!(normalize_path("  file:///home/a.png  "), "/home/a.png");
        assert_eq!(normalize_path("file:///home/my%20image.png"), "/home/my image.png");
        // 不是 file:// 的普通路径原样保留
        assert_eq!(normalize_path("C:/x/y.png"), "C:/x/y.png");
    }

}
