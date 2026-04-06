import "./globals.css";

export const metadata = {
  title: "AI Employee — admin-web",
  description: "AI 员工公司 V1 管理后台"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
