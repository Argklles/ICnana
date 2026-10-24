use std::fs;
use std::path::Path;

/*
    背景图读取。

    不走 asset 协议（权限、路径转义、dev/prod 行为都不一样，容易踩坑），
    直接由 Rust 读文件转成 data URL 交给前端，最省事也最可靠。
*/

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

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

fn mime_of(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
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

/// 把本地图片读成 data URL（前端直接塞进 background-image）
#[tauri::command]
pub fn read_image_as_data_url(path: String) -> Result<String, String> {
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
    Ok(format!("data:{};base64,{}", mime_of(p), base64_encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"hello"), "aGVsbG8=");
    }

    #[test]
    fn reads_local_file_as_data_url() {
        let dir = std::env::temp_dir().join("icnana-assets-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.png");
        std::fs::write(&path, b"\x89PNG\r\n\x1a\n").unwrap();

        let plain = read_image_as_data_url(path.to_string_lossy().to_string()).unwrap();
        assert!(plain.starts_with("data:image/png;base64,"), "前缀不对: {}", &plain[..32.min(plain.len())]);

        // file:// 形式也要能读，且结果一致
        let as_url = format!("file://{}", path.to_string_lossy());
        let via_url = read_image_as_data_url(as_url).unwrap();
        assert_eq!(plain, via_url);
    }

    #[test]
    fn normalize_file_url_and_encoding() {
        assert_eq!(normalize_path("/home/a.png"), "/home/a.png");
        assert_eq!(normalize_path("file:///home/a.png"), "/home/a.png");
        assert_eq!(normalize_path("  file:///home/a.png  "), "/home/a.png");
        assert_eq!(normalize_path("file:///home/my%20image.png"), "/home/my image.png");
        // 不是 file:// 的普通路径原样保留
        assert_eq!(normalize_path("C:/x/y.png"), "C:/x/y.png");
    }

    #[test]
    fn mime_by_extension() {
        assert_eq!(mime_of(Path::new("/a/b.PNG")), "image/png");
        assert_eq!(mime_of(Path::new("x.jpeg")), "image/jpeg");
        assert_eq!(mime_of(Path::new("x.webp")), "image/webp");
    }
}
