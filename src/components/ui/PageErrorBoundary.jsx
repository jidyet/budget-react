import React from "react";

export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("PageErrorBoundary caught:", this.props.sectionName || "unknown-section", error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetToken !== this.props.resetToken && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const c = this.props.palette || {};
    return (
      <div style={{
        padding: "40px 24px",
        borderRadius: 18,
        background: c.surf || "#fff",
        border: `1px solid ${c.border || "#cce"}`,
        textAlign: "center",
        display: "grid",
        gap: 12,
        justifyItems: "center",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted || "#888" }}>
          Page error
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.tx || "#222" }}>{this.props.title || "This section hit a problem"}</div>
        <div style={{ fontSize: 13, color: c.tx2 || "#555", lineHeight: 1.6 }}>
          {this.props.description || "We couldn’t reopen this section yet. Try again or return to another tab."}
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof this.props.onReset === "function") {
              this.props.onReset();
              return;
            }
            this.setState({ hasError: false });
          }}
          style={{
            marginTop: 4,
            padding: "10px 18px",
            borderRadius: 10,
            border: `1px solid ${c.border || "#cce"}`,
            background: c.surf || "#fff",
            color: c.tx || "#222",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
