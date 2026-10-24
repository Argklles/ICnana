// 同一道题的「普通写法」交互器（不用 testlib）：
//   argv[1] = 测试数据文件（里面是答案）
//   stdout  = 发给选手
//   stdin   = 读选手输出
// 退出码 0 = AC，非 0 = WA
#include <bits/stdc++.h>
int main(int argc, char** argv) {
    std::ifstream fin(argv[1]);
    int answer = 0;
    fin >> answer;
    if (answer == 0) { std::cerr << "测试数据里没有答案" << std::endl; return 1; }

    int guess;
    while (std::cin >> guess) {
        if (guess == answer) { std::cout << 1 << std::endl; return 0; }
        std::cout << (guess < answer ? 2 : 3) << std::endl;
    }
    std::cerr << "选手没有给出有效输出" << std::endl;
    return 1;
}
