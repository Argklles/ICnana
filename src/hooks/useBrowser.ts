import { useState, useEffect } from "react";
import { DEFAULT_FAVORITES } from "../config/constants"; // 确保你建了这个文件
import { Favorite, HistoryEntry } from "../config/types";
import { useTauriEvent } from "./useTauriEvent";

export function useBrowser() {
  const [ojUrl, setOjUrl] = useState<string>("https://codeforces.com/problemset/problem/4/A");
  const [browserHistory, setBrowserHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>(DEFAULT_FAVORITES);

  // 初始化加载本地存储
  useEffect(() => {
    const savedFavs = localStorage.getItem("oj_favorites");
    if (savedFavs) { 
      try { setFavorites(JSON.parse(savedFavs)); } catch (e) {} 
    }
    
    const savedHistory = localStorage.getItem("oj_history");
    if (savedHistory) {
      try {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const parsed: HistoryEntry[] = JSON.parse(savedHistory);
        setBrowserHistory(parsed.filter(h => h.timestamp > thirtyDaysAgo));
      } catch (e) {}
    }
  }, []);

  // 监听后端发来的 URL 变化事件
  useTauriEvent<string>("oj_url_changed", (payload) => {
    const newUrl = payload.split("#")[0];
    if (!newUrl.startsWith("http")) return; // 过滤 about:blank

    setOjUrl(newUrl);
    setBrowserHistory(prev => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return [...prev, { url: newUrl, timestamp: Date.now() }]
        .filter(h => h.timestamp >= thirtyDaysAgo)
        .slice(-100);
    });
  });

  // 收藏夹操作
  const addFavorite = (name: string, url: string) => {
    if (!name.trim() || !url.trim()) return;
    const newFavs = [...favorites, { name, url }];
    setFavorites(newFavs);
    localStorage.setItem("oj_favorites", JSON.stringify(newFavs));
  };

  const deleteFavorite = (targetName: string) => {
    const newFavs = favorites.filter(f => f.name !== targetName);
    setFavorites(newFavs);
    localStorage.setItem("oj_favorites", JSON.stringify(newFavs));
  };

  const clearHistory = () => {
    setBrowserHistory([]);
    localStorage.removeItem("oj_history");
  };

  return {
    ojUrl, setOjUrl,
    browserHistory, setBrowserHistory, clearHistory,
    favorites, addFavorite, deleteFavorite
  };
}