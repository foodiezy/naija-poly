import React from "react";

interface State {
  error: Error | null;
}

/**
 * Last-resort catch for render crashes so players never see a white screen
 * mid-game. The server still holds the true game state, so a reload rejoins
 * via the stored reconnection token with nothing lost.
 */
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Render crash:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "var(--canvas, #faf7f2)",
          color: "var(--ink, #101828)",
          fontFamily: "var(--font-v2, system-ui, sans-serif)",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ fontSize: "3rem" }}>😵‍💫</div>
        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Omo, something break!</h1>
        <p style={{ margin: 0, color: "var(--ink-2, #475467)", maxWidth: "420px" }}>
          No wahala — your game is safe on the server. Reload to jump back in.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.7rem 2rem",
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--ink-on-pri, #ffffff)",
            background: "var(--pri, #008751)",
            border: "none",
            borderRadius: "var(--r-lg, 16px)",
            cursor: "pointer",
          }}
        >
          Reload game
        </button>
      </div>
    );
  }
}
