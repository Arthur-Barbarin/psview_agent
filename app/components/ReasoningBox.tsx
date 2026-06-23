"use client";
import { useState } from "react";

export default function ReasoningBox({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-violet-200 bg-violet-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
      >
        <span>🧠</span>
        <span>Agent reasoning</span>
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-violet-800 leading-relaxed border-t border-violet-200 pt-3">
          {reasoning}
        </div>
      )}
    </div>
  );
}
