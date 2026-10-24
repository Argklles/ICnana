// testlib 写法示范：
//   inf  —— 读 argv[1] 指向的测试数据
//   tout —— 写给选手（由 argv[2] 那条通道送到选手的 stdin）
//   ouf  —— 读选手的输出（来自选手的 stdout）
//   quitf(_ok/_wa) —— 判定结果并退出（_ok 退出码 0，_wa 非 0）
#include "testlib.h"

int main(int argc, char** argv) {
    registerInteraction(argc, argv);

    int n = inf.readInt(1, 1000000000, "n");   // 测试数据里的目标值

    for (int round = 1; round <= 40; round++) {
        int q = ouf.readInt(1, 1000000000, "query");

        if (q == n) {
            tout << 1 << std::endl;            // 告诉选手猜中了
            quitf(_ok, "found %d in %d queries", n, round);
        }

        tout << (q < n ? 2 : 3) << std::endl;  // 2 = 小了，3 = 大了
    }

    quitf(_wa, "too many queries, answer was %d", n);
}
