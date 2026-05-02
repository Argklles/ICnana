use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub input: String,
    pub output: String,
    pub actual: String,
    pub status: String,
}
//打包数据（输入输出，测评状态，代码输出）用的结构体


/*
    Competitive Companion 数据结构(用于从插件拉取样例)
*/
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CCTestCase {
    pub input: String,
    pub output: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CCPayload {
    pub name: String,
    pub group: String,
    pub url: String,
    pub time_limit: u64,
    pub memory_limit: u64,
    pub tests: Vec<CCTestCase>,
}