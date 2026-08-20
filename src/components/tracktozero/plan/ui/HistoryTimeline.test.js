import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Upload, CheckCircle2 } from "lucide-react";
import HistoryTimeline from "./HistoryTimeline.jsx";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1E: HistoryTimeline", () => {
  it("renders nothing for an empty entries list", () => {
    expect(render(h(HistoryTimeline, { entries: [] }))).toBe("");
  });

  it("renders each entry's date/title/description", () => {
    const html = render(h(HistoryTimeline, {
      entries: [
        { id: "1", icon: Upload, tone: "info", date: "Mar 01, 2025", title: "Initial import", description: "Debts imported from accounts." },
        { id: "2", icon: CheckCircle2, tone: "go", date: "Mar 10, 2025", title: "First plan created" },
      ],
    }));
    expect(html).toContain("Initial import");
    expect(html).toContain("Debts imported from accounts.");
    expect(html).toContain("First plan created");
  });

  it("draws a connector between entries but not after the last one", () => {
    const html = render(h(HistoryTimeline, {
      entries: [
        { id: "1", date: "d1", title: "t1" },
        { id: "2", date: "d2", title: "t2" },
      ],
    }));
    expect((html.match(/height:2px/g) || []).length).toBe(1);
  });
});
