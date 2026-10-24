// 猜数题：交互器心里有一个 1..100 的数
//   交互器说 1 = 猜中了
//             2 = 你猜小了
//             3 = 你猜大了
// 程序每次输出一个猜测，然后等交互器的回答
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int lo = 1, hi = 100;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        cout << mid << endl;          // endl 会 flush，交互题必须刷

        int reply;
        if (!(cin >> reply)) break;   // 交互器提前关了管道
        if (reply == 1) return 0;     // 猜中，正常退出
        if (reply == 2) lo = mid + 1; // 猜小了
        else hi = mid - 1;            // 猜大了
    }
    return 0;
}
