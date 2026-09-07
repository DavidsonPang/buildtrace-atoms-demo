import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BuildTrace — 从想法到可运行产品",
  description: "一支默认快速、过程可见、产物可编辑的 AI 产品团队。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
