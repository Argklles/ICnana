// 猜数交互题（标准解法）：值域 1..1e9，最多问 40 次
//   输出一个数 → 交互器回答 1=猜中 / 2=猜小了 / 3=猜大了
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long lo = 1, hi = 1000000000LL;
    while (lo <= hi) {
        long long mid = (lo + hi) / 2;
        cout << mid << endl;          // endl 会 flush，交互题必须刷

        int reply;
        if (!(cin >> reply)) break;
        if (reply == 1) return 0;
        if (reply == 2) lo = mid + 1;
        else hi = mid - 1;
    }
    return 0;
}
