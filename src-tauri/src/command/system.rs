use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn open_browser(app: AppHandle, url: String) -> Result<(), String> {
    let safe_url = if url.starts_with("http") {
        url
    }else {
        format!("https://{url}")
    };

    app .opener()
        .open_url(safe_url, None::<&str>)
        .map_err(|e| e.to_string())
}