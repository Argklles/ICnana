// 矩阵猜排列 b
//   交互 → 选手：n
//   选手 → 交互：n 行矩阵（每行 1..n 的排列，行与行都不同）
//   交互 → 选手：按随机排列 b 打乱行序后的整张矩阵
//   选手 → 交互：猜出的 b
//
// 关键：行与行互不相同 ⇒ 返回的每一行都能认回自己写的那一行，b 就浮出来了。
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 1;

    // 用单位排列的循环移位做行，天然保证行与行都不相同
    vector<vector<int>> mine(n, vector<int>(n));
    ostringstream buf;
    for (int t = 0; t < n; t++) {
        for (int j = 0; j < n; j++) {
            mine[t][j] = ((j + t) % n) + 1;
            buf << mine[t][j] << " \n"[j + 1 == n];
        }
    }
    cout << buf.str() << flush;              // ★ 整张矩阵一次性写出并刷新

    map<vector<int>, int> where;             // 行内容 → 我写的行号（1 起）
    for (int t = 0; t < n; t++) where[mine[t]] = t + 1;

    // 读回被打乱的矩阵：第 i 行就是我写的第 b[i] 行
    vector<int> b(n + 1, 0);
    for (int i = 1; i <= n; i++) {
        vector<int> row(n);
        for (int j = 0; j < n; j++) cin >> row[j];
        b[i] = where[row];
    }

    for (int i = 1; i <= n; i++) cout << b[i] << " \n"[i == n];
    cout << flush;
    return 0;
}
