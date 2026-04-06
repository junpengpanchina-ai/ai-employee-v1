/**
 * GRSAI：按 OpenAI Chat Completions 形态调用。
 * GRSAI_BASE_URL 建议包含版本前缀，例如 https://xxx.com/v1
 * 实际请求：{GRSAI_BASE_URL}/{GRSAI_COMPLETIONS_PATH}，默认路径 chat/completions
 */
export async function callGRSAI({ userText }) {
  const base = process.env.GRSAI_BASE_URL?.replace(/\/$/, "");
  const key = process.env.GRSAI_API_KEY;
  const model = process.env.BOT_MODEL || "gpt-4o-mini";
  const pathSeg = (
    process.env.GRSAI_COMPLETIONS_PATH || "chat/completions"
  ).replace(/^\//, "");

  if (!base || !key) {
    throw new Error("GRSAI_BASE_URL and GRSAI_API_KEY are required");
  }

  const url = `${base}/${pathSeg}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are the AI general manager assistant. Reply concisely in the same language as the user."
        },
        { role: "user", content: userText?.trim() ? userText : "(empty message)" }
      ]
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      JSON.stringify(data).slice(0, 500) ||
      `GRSAI HTTP ${res.status}`;
    throw new Error(msg);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error("GRSAI response missing message content");
  }
  return String(content).trim();
}
