"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    fetch(`${apiUrl}/health`)
      .then((res) => {
        if (res.ok) setStatus("ok");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold tracking-tight">PM Tracker</h1>
      <p className="text-sm text-gray-400">
        後端狀態：{" "}
        {status === "checking" && <span className="text-yellow-400">檢查中…</span>}
        {status === "ok" && <span className="text-green-400">已連線</span>}
        {status === "error" && <span className="text-red-400">無法連線</span>}
      </p>
    </main>
  );
}
