/**
 * 内置 mock 情报源：用于 WM / RSS 都不可用时跑通 /intel 链路。
 * 条目会带上「现在 - N 小时」的时间戳，保证 sinceHours 过滤器能命中。
 */

/** @typedef {import("../worldmonitorFeed.js").IntelItemRaw} IntelItemRaw */

/**
 * @param {number} hoursAgo
 * @returns {string}
 */
function isoHoursAgo(hoursAgo) {
  const t = new Date(Date.now() - hoursAgo * 3600 * 1000);
  return t.toISOString();
}

/**
 * @returns {IntelItemRaw[]}
 */
export function buildMockIntelItems() {
  return [
    {
      title: "美联储 6 月议息会议维持利率不变，但暗示年内或有一次降息",
      source: "mock:macro-wire",
      published_at: isoHoursAgo(2),
      summary:
        "鲍威尔讲话显示委员会对通胀回落取得进展仍需更多证据，点阵图中位数由两次降息调整为一次；市场反应平淡，美债收益率小幅回落。",
      url: "https://example.com/mock/fed-june",
    },
    {
      title: "英伟达在 GTC 上发布新一代数据中心 GPU，功耗较上一代下降 25%",
      source: "mock:tech-daily",
      published_at: isoHoursAgo(5),
      summary:
        "新品采用 3nm 工艺，HBM4 内存带宽提升至 12TB/s；多家云厂商宣布已下单，预计 Q4 开始出货。",
      url: "https://example.com/mock/nvda-gtc",
    },
    {
      title: "欧盟与美国就关键矿产供应链达成初步协议",
      source: "mock:geopolitics",
      published_at: isoHoursAgo(8),
      summary:
        "双方拟建立联合采购机制，覆盖锂、钴、稀土等 17 种关键矿产，并同步推出对华贸易豁免清单草案。",
      url: "https://example.com/mock/eu-us-minerals",
    },
    {
      title: "国内某头部电商平台宣布物流基础设施海外投资计划",
      source: "mock:cn-biz",
      published_at: isoHoursAgo(11),
      summary:
        "未来三年将在东南亚新建 12 个分拨中心，目标将平均跨境配送时效压缩至 48 小时内；CFO 表示该计划短期利润承压。",
      url: "https://example.com/mock/cn-logistics",
    },
    {
      title: "比特币现货 ETF 单日净流入创近三个月新高",
      source: "mock:crypto",
      published_at: isoHoursAgo(16),
      summary:
        "贝莱德 IBIT 单日净流入 6.2 亿美元，推动 BTC 突破前高；链上数据亦显示长期持有者仓位连续 5 周上升。",
      url: "https://example.com/mock/btc-etf",
    },
  ];
}
