import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Something went wrong.",
    };
  }

  componentDidCatch(error, info) {
    console.error("AppErrorBoundary caught an error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px 18px",
          background: "linear-gradient(180deg, #f7fbff, #edf6ff)",
          fontFamily: "'Instrument Sans',sans-serif",
          color: "#15284b",
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            background: "#ffffff",
            border: "1px solid #cfe0ff",
            borderRadius: 22,
            padding: "24px 22px",
            boxShadow: "0 18px 48px rgba(21,40,75,0.12)",
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6582b0" }}>
            Safe fallback
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
            The app hit a bump
          </div>
          <div style={{ fontSize: 14, color: "#4b6286", lineHeight: 1.6 }}>
            Your data is still there. Refresh the app and try again. If it keeps happening, send feedback and include what you were doing.
          </div>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#f7fbff",
              border: "1px solid #d9e6fb",
              fontSize: 12,
              color: "#4b6286",
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}
          >
            {this.state.errorMessage}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: "#14b8a6",
                color: "#001014",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Refresh app
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #b9cef1",
                background: "#ffffff",
                color: "#15284b",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Back home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
