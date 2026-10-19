use std::collections::HashSet;
use std::fs;

use serde::{Deserialize, Serialize};

use crate::utils::ic_fs;

/*
    收藏夹 / 自定义集合。

    设计原则：文件系统是唯一事实来源，这里 **只存引用**（题目文件夹名），
    不复制题目名、链接这些信息——那些仍然从 question.json 读。
    这样即使 collections.json 被删掉或写坏，也只会丢「分组」，不会丢题目本身。
*/

/// 内置收藏夹的固定 id，永远存在、不允许删除
pub const FAVORITES_ID: &str = "favorites";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    /// favorites（内置收藏） / oj（按来源自动归类） / custom（用户自建）
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub items: Vec<String>,
}

fn default_kind() -> String {
    "custom".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionStore {
    pub version: u32,
    /// 是否已经把「已有题目按 OJ 归入集合」补做过一次
    #[serde(default)]
    pub oj_backfilled: bool,
    #[serde(default)]
    pub collections: Vec<Collection>,
}

impl Default for CollectionStore {
    fn default() -> Self {
        Self {
            version: 1,
            oj_backfilled: false,
            collections: vec![Collection {
                id: FAVORITES_ID.to_string(),
                name: "收藏".to_string(),
                kind: "favorites".to_string(),
                items: vec![],
            }],
        }
    }
}

/// 老文件可能缺 kind（或写得不对），读进来时统一矫正：以 id 为准
fn normalize(store: &mut CollectionStore) {
    ensure_favorites(store);

    for collection in &mut store.collections {
        if collection.id == FAVORITES_ID {
            collection.kind = "favorites".to_string();
        } else if collection.id.starts_with("oj:") {
            collection.kind = "oj".to_string();
        } else if collection.kind.is_empty() {
            collection.kind = "custom".to_string();
        }
    }
}

fn ensure_favorites(store: &mut CollectionStore) {
    if !store.collections.iter().any(|c| c.id == FAVORITES_ID) {
        store.collections.insert(
            0,
            Collection {
                id: FAVORITES_ID.to_string(),
                name: "收藏".to_string(),
                kind: "favorites".to_string(),
                items: vec![],
            },
        );
    }
}

/// 首次运行时，把老版本写在各题 question.json 里的 favorite 迁移进「收藏」集合
fn migrate_legacy_favorites() -> CollectionStore {
    let mut store = CollectionStore::default();

    if let Ok(entries) = fs::read_dir(ic_fs::workspace_dir()) {
        let mut items: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
            .filter(|name| !name.starts_with('.'))
            .filter(|name| {
                fs::read_to_string(ic_fs::workspace_question(name))
                    .ok()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|v| v["favorite"].as_bool())
                    .unwrap_or(false)
            })
            .collect();
        items.sort();
        store.collections[0].items = items;
    }

    store
}

fn load_store() -> CollectionStore {
    let path = ic_fs::collections_path();

    if let Ok(text) = fs::read_to_string(&path) {
        if let Ok(mut store) = serde_json::from_str::<CollectionStore>(&text) {
            normalize(&mut store);
            return store;
        }
    }

    // 文件不存在（或损坏）→ 从旧存档迁移一次
    migrate_legacy_favorites()
}

fn save_store(store: &CollectionStore) -> Result<(), String> {
    ic_fs::ensure_workspace().map_err(|e| e.to_string())?;

    let path = ic_fs::collections_path();
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;

    // 先写临时文件再 rename，避免写一半断电把整个索引写坏
    fs::write(&tmp, text).map_err(|e| format!("写入集合失败: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("保存集合失败: {e}"))?;
    Ok(())
}

/// OJ 的展示名
pub fn oj_label(oj: &str) -> &'static str {
    match oj {
        "luogu" => "洛谷",
        "codeforces" => "Codeforces",
        "atcoder" => "AtCoder",
        "nowcoder" => "牛客",
        _ => "未分类",
    }
}

/// OJ 集合的固定 id，例如 `oj:luogu`
pub fn oj_collection_id(oj: &str) -> String {
    format!("oj:{oj}")
}

fn ensure_oj_collection<'a>(store: &'a mut CollectionStore, oj: &str) -> &'a mut Collection {
    let id = oj_collection_id(oj);
    if let Some(idx) = store.collections.iter().position(|c| c.id == id) {
        return &mut store.collections[idx];
    }

    store.collections.push(Collection {
        id,
        name: oj_label(oj).to_string(),
        kind: "oj".to_string(),
        items: vec![],
    });
    store.collections.last_mut().expect("刚 push 过")
}

/// 拉取题目后调用：解析出的 OJ 直接落进对应的「OJ 收藏夹」
pub fn assign_to_oj(stem: &str, oj: &str) {
    if oj == "other" {
        return; // 认不出来就留在「未分类」，不硬塞
    }

    let mut store = load_store();
    let mut changed = false;
    {
        let collection = ensure_oj_collection(&mut store, oj);
        if !collection.items.iter().any(|s| s == stem) {
            collection.items.push(stem.to_string());
            collection.items.sort();
            changed = true;
        }
    }
    if changed {
        let _ = save_store(&store);
    }
}

/// 老用户升级后用一次：把已有题目按 OJ 补进集合（只跑一次，之后手动调整不会被覆盖）
pub fn backfill_oj(entries: &[(String, String)]) {
    let mut store = load_store();
    if store.oj_backfilled {
        return;
    }

    for (stem, oj) in entries {
        if oj == "other" {
            continue;
        }
        let collection = ensure_oj_collection(&mut store, oj);
        if !collection.items.iter().any(|s| s == stem) {
            collection.items.push(stem.clone());
        }
    }
    for collection in &mut store.collections {
        if collection.kind == "oj" {
            collection.items.sort();
        }
    }

    store.oj_backfilled = true;
    let _ = save_store(&store);
}

/// 给文件列表用的「收藏集合成员」快照
pub fn favorite_stems() -> HashSet<String> {
    load_store()
        .collections
        .into_iter()
        .find(|c| c.id == FAVORITES_ID)
        .map(|c| c.items.into_iter().collect())
        .unwrap_or_default()
}

/// 删除题目后清理引用，避免集合里留下打不开的幽灵条目
pub fn forget_stem(stem: &str) {
    let mut store = load_store();
    let mut changed = false;
    for collection in &mut store.collections {
        let before = collection.items.len();
        collection.items.retain(|s| s != stem);
        changed |= collection.items.len() != before;
    }
    if changed {
        let _ = save_store(&store);
    }
}

/// 重命名题目后同步引用
pub fn rename_stem(old_stem: &str, new_stem: &str) {
    let mut store = load_store();
    let mut changed = false;
    for collection in &mut store.collections {
        for item in &mut collection.items {
            if item == old_stem {
                *item = new_stem.to_string();
                changed = true;
            }
        }
    }
    if changed {
        let _ = save_store(&store);
    }
}

fn oj_rank_of(collection: &Collection) -> u8 {
    match collection.id.strip_prefix("oj:") {
        Some("luogu") => 0,
        Some("codeforces") => 1,
        Some("atcoder") => 2,
        Some("nowcoder") => 3,
        Some(_) => 4,
        None => 9,
    }
}

#[tauri::command]
pub fn list_collections() -> Vec<Collection> {
    let mut collections = load_store().collections;

    // 收藏 → OJ 分组（按固定顺序） → 用户自建（按名字）
    collections.sort_by(|a, b| {
        let rank = |c: &Collection| match c.kind.as_str() {
            "favorites" => 0u8,
            "oj" => 1,
            _ => 2,
        };
        rank(a)
            .cmp(&rank(b))
            .then_with(|| oj_rank_of(a).cmp(&oj_rank_of(b)))
            .then_with(|| a.name.cmp(&b.name))
    });

    collections
}

#[tauri::command]
pub fn create_collection(name: String) -> Result<Collection, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("集合名不能为空喵".to_string());
    }

    let mut store = load_store();
    if store.collections.iter().any(|c| c.name == name) {
        return Err(format!("已经有一个叫「{name}」的集合啦"));
    }

    let id = format!(
        "c{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    let collection = Collection {
        id,
        name,
        kind: "custom".to_string(),
        items: vec![],
    };
    store.collections.push(collection.clone());
    save_store(&store)?;
    Ok(collection)
}

#[tauri::command]
pub fn delete_collection(id: String) -> Result<(), String> {
    if id == FAVORITES_ID {
        return Err("默认收藏夹不能删除喵".to_string());
    }

    let mut store = load_store();

    if let Some(target) = store.collections.iter().find(|c| c.id == id) {
        if target.kind == "oj" {
            return Err("OJ 分组是自动维护的，不能删除喵".to_string());
        }
    }

    store.collections.retain(|c| c.id != id);
    save_store(&store)
}

/// 纯逻辑：修改内存里的集合成员关系（便于测试，也避免命令里混着 IO）
fn set_membership(
    store: &mut CollectionStore,
    id: &str,
    stem: &str,
    member: bool,
) -> Result<(), String> {
    let Some(collection) = store.collections.iter_mut().find(|c| c.id == id) else {
        return Err("找不到这个集合喵".to_string());
    };

    if member {
        if !collection.items.iter().any(|s| s == stem) {
            collection.items.push(stem.to_string());
            collection.items.sort();
        }
    } else {
        collection.items.retain(|s| s != stem);
    }

    Ok(())
}

/// 把某个题目加入 / 移出指定集合
#[tauri::command]
pub fn toggle_in_collection(id: String, stem: String, member: bool) -> Result<(), String> {
    let mut store = load_store();
    set_membership(&mut store, &id, &stem, member)?;
    save_store(&store)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> CollectionStore {
        CollectionStore::default()
    }

    #[test]
    fn default_store_has_favorites() {
        let s = store();
        assert_eq!(s.collections.len(), 1);
        assert_eq!(s.collections[0].id, FAVORITES_ID);
    }

    #[test]
    fn add_and_remove_membership() {
        let mut s = store();
        set_membership(&mut s, FAVORITES_ID, "P1001", true).unwrap();
        set_membership(&mut s, FAVORITES_ID, "A. Watermelon", true).unwrap();
        assert_eq!(s.collections[0].items, vec!["A. Watermelon", "P1001"]);

        // 重复加入不应该产生重复项
        set_membership(&mut s, FAVORITES_ID, "P1001", true).unwrap();
        assert_eq!(s.collections[0].items.len(), 2);

        set_membership(&mut s, FAVORITES_ID, "P1001", false).unwrap();
        assert_eq!(s.collections[0].items, vec!["A. Watermelon"]);
    }

    #[test]
    fn unknown_collection_errors() {
        let mut s = store();
        assert!(set_membership(&mut s, "nope", "P1001", true).is_err());
    }

    #[test]
    fn oj_labels_cover_supported_judges() {
        assert_eq!(oj_label("luogu"), "洛谷");
        assert_eq!(oj_label("codeforces"), "Codeforces");
        assert_eq!(oj_label("atcoder"), "AtCoder");
        assert_eq!(oj_label("nowcoder"), "牛客");
        assert_eq!(oj_label("other"), "未分类");
    }

    #[test]
    fn ensure_oj_collection_is_idempotent() {
        let mut s = store();
        ensure_oj_collection(&mut s, "luogu").items.push("P1001".into());
        ensure_oj_collection(&mut s, "luogu").items.push("P1002".into());

        let oj_collections: Vec<_> = s.collections.iter().filter(|c| c.kind == "oj").collect();
        assert_eq!(oj_collections.len(), 1);
        assert_eq!(oj_collections[0].id, "oj:luogu");
        assert_eq!(oj_collections[0].name, "洛谷");
        assert_eq!(oj_collections[0].items, vec!["P1001", "P1002"]);
    }

    #[test]
    fn oj_collections_sort_before_custom_ones() {
        let mut s = store();
        ensure_oj_collection(&mut s, "codeforces");
        ensure_oj_collection(&mut s, "luogu");
        s.collections.push(Collection {
            id: "c1".into(),
            name: "考前复习".into(),
            kind: "custom".into(),
            items: vec![],
        });

        let mut sorted = s.collections.clone();
        sorted.sort_by(|a, b| {
            let rank = |c: &Collection| match c.kind.as_str() {
                "favorites" => 0u8,
                "oj" => 1,
                _ => 2,
            };
            rank(a).cmp(&rank(b)).then_with(|| oj_rank_of(a).cmp(&oj_rank_of(b)))
        });
        let order: Vec<&str> = sorted.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(order, vec![FAVORITES_ID, "oj:luogu", "oj:codeforces", "c1"]);
    }

    #[test]
    fn ensure_favorites_reinserts_builtin() {
        let mut s = store();
        s.collections.clear();
        ensure_favorites(&mut s);
        assert_eq!(s.collections[0].id, FAVORITES_ID);
    }
}
