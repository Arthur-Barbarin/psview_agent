import { NextRequest, NextResponse } from "next/server";

// Thin Tavily wrapper. Returns the AI-summarized answer + top results, or a
// graceful "disabled" payload if TAVILY_API_KEY is unset. Called server-side
// from /api/plan when the agent decides to research the candidate.

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchResponse {
  query: string;
  answer: string | null;
  results: TavilyResult[];
  disabled?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "missing query" }, { status: 400 });
    }

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json({
        query,
        answer: null,
        results: [],
        disabled: true,
      });
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 4,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("[/api/research] Tavily", res.status, txt.slice(0, 300));
      return NextResponse.json(
        { query, answer: null, results: [], error: `Tavily ${res.status}` },
        { status: 200 } // soft fail — planner should continue without research
      );
    }

    const data = await res.json();
    const results: TavilyResult[] = (data.results ?? []).slice(0, 4).map((r: { title: string; url: string; content: string; score?: number }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));

    return NextResponse.json({
      query,
      answer: data.answer ?? null,
      results,
    });
  } catch (e) {
    console.error("[/api/research]", e);
    return NextResponse.json(
      { query: "", answer: null, results: [], error: String(e) },
      { status: 200 }
    );
  }
}
