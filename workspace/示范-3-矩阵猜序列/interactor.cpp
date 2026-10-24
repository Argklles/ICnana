// testlib 交互器：随机生成排列 b → 收矩阵 → 按 b 打乱行序返回 → 校验选手猜的 b
//   测试数据：seed n
#include "testlib.h"

#include <set>
#include <vector>

int main(int argc, char** argv) {
    registerInteraction(argc, argv);

    long long seed = inf.readLong(0, 1000000000000000000LL, "seed");
    int n = inf.readInt(1, 9999, "n");
    rnd.setSeed(seed);

    // 要猜的那个排列 b，每次运行由 seed 决定，选手事先不可能知道
    std::vector<int> b(n);
    for (int i = 0; i < n; i++) b[i] = i + 1;
    shuffle(b.begin(), b.end());

    tout << n << std::endl;

    // 收矩阵：每行必须是 1..n 的排列，且行与行不同
    std::set<std::vector<int>> seen;
    std::vector<std::vector<int>> rows(n, std::vector<int>(n));
    for (int i = 0; i < n; i++) {
        std::vector<int> appeared(n + 1, 0);
        for (int j = 0; j < n; j++) {
            int v = ouf.readInt(1, n, format("m[%d][%d]", i + 1, j + 1));
            if (appeared[v]++) quitf(_wa, "第 %d 行不是排列：值 %d 重复", i + 1, v);
            rows[i][j] = v;
        }
        if (!seen.insert(rows[i]).second) quitf(_wa, "第 %d 行与前面某一行完全相同", i + 1);
    }

    // 按 b 打乱行序：返回的第 i 行 = 选手的第 b[i] 行
    for (int i = 0; i < n; i++) {
        const std::vector<int>& row = rows[b[i] - 1];
        for (int j = 0; j < n; j++) tout << row[j] << " \n"[j + 1 == n];
        tout << std::endl;
    }

    // 收选手猜的 b
    std::vector<int> guess(n);
    for (int i = 0; i < n; i++) guess[i] = ouf.readInt(1, n, format("guess[%d]", i + 1));

    if (guess != b) quitf(_wa, "猜错了，正确排列是另一个");
    quitf(_ok, "猜中排列 b（n=%d, seed=%lld）", n, seed);
}
