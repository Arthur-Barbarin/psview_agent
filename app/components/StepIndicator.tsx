"use client";
import { useEffect, useState } from "react";

const steps = [
  { id: 1, label: "Company" },
  { id: 2, label: "Agent" },
  { id: 3, label: "Simulate" },
];

export default function StepIndicator({ current }: { current: number }) {
  // Defer to client to avoid hydration mismatch with localStorage-persisted step
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? current : 1;

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step.id < active
                  ? "bg-violet-600 text-white"
                  : step.id === active
                  ? "bg-violet-600 text-white ring-4 ring-violet-100"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step.id < active ? "✓" : step.id}
            </div>
            <span
              className={`text-sm font-medium ${
                step.id === active ? "text-gray-900" : step.id < active ? "text-violet-600" : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mx-3 ${step.id < active ? "bg-violet-300" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
