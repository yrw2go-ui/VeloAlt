"use client";
// 🧯 When a screen throws, React takes the whole app down with it and the only trace is in the
// browser's own console — nothing reaches the server, which is why a group that wouldn't open
// looked like "a client-side exception" and left no line anywhere. This catches it, keeps the
// rest of the app standing, and says on screen what actually went wrong.
import { Component, type ReactNode } from "react";

type P = { children: ReactNode; what: string };
type S = { err: string | null };

export class Boundary extends Component<P, S> {
  state: S = { err: null };
  static getDerivedStateFromError(e: unknown): S {
    return { err: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    // In the browser's console too, where a developer would look for it.
    console.error(`${this.props.what} crashed`, e);
  }
  render() {
    if (this.state.err === null) return this.props.children;
    return (
      <div data-testid="boundary" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <b style={{ fontSize: 15 }}>⚠️ {this.props.what} couldn&apos;t open</b>
        <div className="muted" style={{ fontSize: 13 }}>The rest of the app is fine — this is what went wrong here:</div>
        <code data-testid="boundary-why" style={{ fontSize: 12, padding: 10, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)", maxWidth: "100%", overflowWrap: "anywhere" }}>{this.state.err}</code>
        <button className="ghost" onClick={() => this.setState({ err: null })} data-testid="boundary-retry" style={{ padding: "6px 14px" }}>Try again</button>
      </div>
    );
  }
}
