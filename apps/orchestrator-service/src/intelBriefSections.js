/**
 * 从 GRSAI 返回的「今日情报简报」正文中抽取六段（与 intelPrompts 一、二… 标题一致）。
 */

/**
 * @param {string} replyText
 * @returns {{
 *   top_change: string,
 *   primary_contradiction: string,
 *   structural_flow: string,
 *   competitive_position: string,
 *   relation_to_user: string,
 *   actions: string[]
 * }}
 */
export function extractIntelBriefSections(replyText) {
  const t = String(replyText || "");
  const out = {
    top_change: "",
    primary_contradiction: "",
    structural_flow: "",
    competitive_position: "",
    relation_to_user: "",
    actions: /** @type {string[]} */ ([])
  };

  function sliceBetween(startLabel, endLabel) {
    const i = t.indexOf(startLabel);
    if (i === -1) return "";
    const start = i + startLabel.length;
    const j = endLabel ? t.indexOf(endLabel, start) : -1;
    const end = j === -1 ? t.length : j;
    return t.slice(start, end).trim();
  }

  out.top_change = sliceBetween("一、今日最重要的变化", "二、主要矛盾");
  out.primary_contradiction = sliceBetween("二、主要矛盾", "三、结构流向");
  out.structural_flow = sliceBetween("三、结构流向", "四、竞争位置");
  out.competitive_position = sliceBetween("四、竞争位置", "五、与你的关系");
  out.relation_to_user = sliceBetween("五、与你的关系", "六、今日动作");
  const actionBlock = sliceBetween("六、今日动作", null);
  out.actions = actionBlock
    .split("\n")
    .map((s) => s.trim())
    .filter((line) => /^\d+\./.test(line))
    .slice(0, 8);

  return out;
}
