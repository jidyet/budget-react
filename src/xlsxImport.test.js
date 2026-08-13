import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

// Regression coverage for the xlsx dependency swap (P0-2): ExcelImport.jsx's
// handleFile() reads untrusted uploaded workbooks with exactly this API
// surface (src/ExcelImport.jsx:834-843). This proves the SheetJS CDN build
// still parses the same way the npm-registry 0.18.5 build did, for the
// options this app actually relies on.

describe("xlsx import parsing (matches src/ExcelImport.jsx handleFile)", () => {
  it("round-trips a workbook through XLSX.read + sheet_to_json with the app's exact options", () => {
    const aoa = [
      ["Date", "Description", "Amount"],
      [new Date(2026, 0, 15), "Coffee Shop", 4.5],
      [null, "", null],
      [new Date(2026, 0, 16), "Rent", 1200],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const readWb = XLSX.read(buf, { type: "array", cellDates: true });
    expect(readWb.SheetNames).toEqual(["Sheet1"]);

    const rows = XLSX.utils.sheet_to_json(readWb.Sheets["Sheet1"], {
      header: 1,
      defval: null,
      cellDates: true,
      blankrows: true,
    });

    expect(rows[0]).toEqual(["Date", "Description", "Amount"]);
    expect(rows[1][0]).toBeInstanceOf(Date);
    expect(rows[1][0].getFullYear()).toBe(2026);
    expect(rows[1][1]).toBe("Coffee Shop");
    expect(rows[1][2]).toBe(4.5);
    // blank row preserved (blankrows: true) instead of being dropped
    expect(rows.length).toBe(4);
    expect(rows[3][1]).toBe("Rent");
  });

  it("parses CSV text through the same XLSX.read call (no separate CSV parser exists)", () => {
    const csv = "Date,Description,Amount\n2026-01-15,Coffee Shop,4.5\n2026-01-16,Rent,1200\n";
    const buf = new TextEncoder().encode(csv);

    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: null,
      cellDates: true,
      blankrows: true,
    });

    expect(rows[0]).toEqual(["Date", "Description", "Amount"]);
    expect(rows[1][1]).toBe("Coffee Shop");
    expect(rows[2][1]).toBe("Rent");
  });
});
