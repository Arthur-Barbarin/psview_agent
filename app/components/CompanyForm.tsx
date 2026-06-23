"use client";
import { useState } from "react";
import { Company } from "../types";

const EXAMPLE: Company = {
  name: "Mistral AI",
  description: "European AI lab building frontier open-weight models. Fast-moving, deeply technical, Paris-based.",
  culture: "Radical transparency, high ownership, no bureaucracy. Engineers ship fast and have real impact. Strong research culture without losing sight of product.",
  profiles: "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems. People who've built things at top labs or startups, not just big corps.",
  tone: "Direct and smart. No corporate speak. Peer-to-peer, like one engineer talking to another.",
};

export default function CompanyForm({ onSubmit }: { onSubmit: (company: Company) => void }) {
  const [form, setForm] = useState<Company>({ name: "", description: "", culture: "", profiles: "", tone: "" });
  const [loading, setLoading] = useState(false);

  const fill = () => setForm(EXAMPLE);
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onSubmit(form);
  };

  const ready = Object.values(form).every((v) => v.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Company context</h2>
          <p className="text-sm text-gray-500 mt-0.5">The agent reads this and configures itself. Be specific.</p>
        </div>
        <button type="button" onClick={fill} className="text-xs text-violet-600 hover:text-violet-800 font-medium underline">
          Fill example
        </button>
      </div>

      <Field label="Company name" required>
        <input
          className="input"
          placeholder="e.g. Stripe, Mistral AI, Doctolib"
          value={form.name}
          onChange={set("name")}
          required
        />
      </Field>

      <Field label="What do they do?" hint="2-3 sentences. Stage, market, mission." required>
        <textarea
          className="input min-h-[80px]"
          placeholder="European AI lab building frontier open-weight models..."
          value={form.description}
          onChange={set("description")}
          required
        />
      </Field>

      <Field label="Culture & values" hint="What makes this place different to work at?" required>
        <textarea
          className="input min-h-[80px]"
          placeholder="High ownership, radical transparency, no bureaucracy..."
          value={form.culture}
          onChange={set("culture")}
          required
        />
      </Field>

      <Field label="Profiles they hire" hint="Types of people, seniority, backgrounds they value" required>
        <textarea
          className="input min-h-[70px]"
          placeholder="Senior ML engineers, research scientists who've worked at top labs..."
          value={form.profiles}
          onChange={set("profiles")}
          required
        />
      </Field>

      <Field label="Communication tone" hint="How should the agent sound?" required>
        <input
          className="input"
          placeholder="e.g. Direct and smart. No corporate speak. Peer-to-peer."
          value={form.tone}
          onChange={set("tone")}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={!ready || loading}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
      >
        {loading ? "Configuring agent…" : "Configure agent →"}
      </button>
    </form>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-violet-500">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
