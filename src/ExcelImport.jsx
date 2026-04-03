import { useState, useRef } from "react";
import { fx } from "./utils/budgetUtils";

// Column mapping based on your existing Excel structure:
// A = Expense (name), B = Amount (min due), C = Due Date, D = Adj Due Date
// E = Paid?, F = Amt Paid, G = APR, H = Balance, I = Est Next Payment
// J = New Purchases, K = Master Sheet Note

function normalizeHeader(h) {
  return String(h || "").toLowerCase().trim()
    .replace(/[^a-z0-9]/g, "");
}

function matchColumn(headers, keywords) {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => normalizeHeader(h).includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Try to match an Excel row name to a MOCK_ACCOUNTS entry
// Map from Excel name fragments → account id (all lowercase)
const EXCEL_NAME_MAP = [
  // CREDIT CARDS
  { frags:["capital one","kristina","credit card"],        id:1  },
  { frags:["chase","kristina","credit card"],              id:2  },
  { frags:["amex","stallion"],                             id:3  },
  { frags:["chase","stallion","credit card"],              id:4  },
  { frags:["navy federal","personal credit","kristina"],   id:5  },
  { frags:["bofa","babajide"],                             id:6  },
  { frags:["usbank","credit card","kristina"],             id:7  },
  { frags:["capital one","babajide"],                      id:8  },
  { frags:["discover","babajide"],                         id:9  },
  { frags:["discover","kristina"],                         id:10 },
  { frags:["navy federal","credit card","babajide"],       id:11 },
  { frags:["bofa","kristina"],                             id:12 },
  { frags:["citi","kristina"],                             id:14 },
  // STUDENT LOANS
  { frags:["aidvantage","kristina"],                       id:15 }, // maps all 9 to first; ok for import
  { frags:["mohela"],                                      id:24 },
  { frags:["utd","babajide"],                              id:25 },
  { frags:["firstmark"],                                   id:26 },
  // PERSONAL LOANS
  { frags:["sofi","personal","babajide"],                  id:27 },
  { frags:["sofi","personal","kristina"],                  id:28 },
  { frags:["affirm","apple"],                              id:29 },
  { frags:["affirm","samsung"],                            id:30 },
  { frags:["affirm","priceline"],                          id:31 },
  // LINE OF CREDIT
  { frags:["wells fargo","stallion"],                      id:32 },
  { frags:["usbank","line of credit"],                     id:33 },
  { frags:["chase","line of credit"],                      id:34 },
  // INSURANCE
  { frags:["tommy","globe life"],                          id:35 },
  { frags:["aj","new york life"],                          id:36 },
  { frags:["car","auto insurance"],                        id:37 },
  { frags:["jide","new york life"],                        id:38 },
  { frags:["kristina","new york life"],                    id:39 },
  { frags:["dad","trustage"],                              id:40 },
  { frags:["mike","globe life"],                           id:41 },
  { frags:["dad","new york life"],                         id:42 },
  { frags:["uncle james"],                                 id:43 },
  // SUBSCRIPTIONS
  { frags:["walmart plus"],                                id:44 },
  { frags:["amazon","prime"],                              id:45 },
  { frags:["samsung"],                                     id:46 },
  { frags:["peacock"],                                     id:47 },
  { frags:["disney","hulu"],                               id:48 },
  { frags:["ytmusic"],                                     id:49 },
  // HOME EXPENSES
  { frags:["rent","antler"],                               id:50 },
  { frags:["school fees"],                                 id:51 },
  { frags:["phone","tmobile"],                             id:52 },
  { frags:["internet","frontier"],                         id:53 },
  { frags:["renters insurance"],                           id:54 },
  { frags:["gas vehicle"],                                 id:55 },
  { frags:["groceries"],                                   id:56 },
  { frags:["household advance"],                           id:57 },
  { frags:["restaurants"],                                 id:58 },
  { frags:["toll service"],                                id:59 },
  // UTILITIES
  { frags:["sewer","trash"],                               id:60 },
  { frags:["electricity","trieagle"],                      id:61 },
  { frags:["gas","atmos"],                                 id:62 },
  { frags:["gas","atoms"],                                 id:62 }, // Excel typo variant
  // BUSINESS
  { frags:["navy federal","business","kristina"],          id:63 },
  { frags:["usbank","business","kristina"],                id:64 },
  // STORAGE
  { frags:["container storage"],                           id:65 },
  { frags:["mo storage","public storage"],                 id:66 },
  { frags:["tx storage","extra storage"],                  id:67 },
];

function fuzzyMatch(rowName, accounts) {
  if (!rowName) return null;
  const rn = String(rowName).toLowerCase();

  // Try map first (most precise — all fragments must appear in the row name)
  for (const entry of EXCEL_NAME_MAP) {
    if (entry.frags.every(f => rn.includes(f))) {
      const acct = accounts.find(a => a.id === entry.id);
      if (acct) {
        // Exact map match: confidence based on fragment coverage
        const words = rn.split(/\s+/).filter(Boolean);
        const matchedWords = entry.frags.filter(f => words.some(w => w.includes(f) || f.includes(w))).length;
        const wordScore = words.length > 0 ? Math.round((matchedWords / words.length) * 100) : 80;
        acct._matchConfidence = wordScore >= 90 ? "Exact" : wordScore >= 70 ? "Good" : "Fuzzy";
        return acct;
      }
    }
  }

  // Fallback: normalized string comparison
  const clean = rn.replace(/[^a-z0-9]/g, "");
  const found = accounts.find(a => {
    const an = a.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return an === clean || (clean.length > 6 && (an.includes(clean) || clean.includes(an)));
  }) || null;
  if (found) {
    const an = found.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    found._matchConfidence = an === clean ? "Exact" : "Fuzzy";
  }
  return found;
}

function parseMoney(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function parseBool(v) {
  if (v == null) return false;
  const s = String(v).toLowerCase().trim();
  return s === "yes" || s === "true" || s === "1" || s === "x" || s === "paid";
}

export default function ExcelImport({ accounts, theme, onImported, onUpload }) {
  const [status, setStatus]   = useState("idle");
  const [rows, setRows]       = useState([]);
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const fileRef = useRef();

  const D = theme === "dark";
  const c = {
    bg:     D?"#0a0a0a":"#f4f3ef",
    surf:   D?"#141414":"#ffffff",
    surf2:  D?"#1e1e1e":"#f0efe9",
    border: D?"#2c2c2c":"#e2e0d8",
    border2:D?"#3a3a3a":"#ccc9be",
    tx:     D?"#f0f0f0":"#111111",
    tx2:    D?"#a0a0a0":"#4a4a4a",
    muted:  D?"#555555":"#999888",
    ac:     "#00c9a7",
    acD:    D?"rgba(0,201,167,.14)":"rgba(0,201,167,.10)",
    go:     D?"#22d65a":"#0a9e3f",
    goD:    D?"rgba(34,214,90,.12)":"rgba(10,158,63,.08)",
    wa:     D?"#ffaa00":"#c97800",
    da:     D?"#ff4c4c":"#d42828",
    daD:    D?"rgba(255,76,76,.12)":"rgba(212,40,40,.08)",
  };

  const btn = (bg, col="#000", disabled=false) => ({
    padding:"9px 18px", borderRadius:8, border:"none",
    background: disabled ? c.border2 : bg,
    color: disabled ? c.muted : col,
    fontSize:13, fontWeight:700,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily:"'Instrument Sans',sans-serif",
    opacity: disabled ? 0.6 : 1,
  });

  const fxLocal = (v) => v == null ? "—" : fx(v);

  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      setErrorMsg("Please upload an .xlsx, .xls, or .csv file.");
      setStatus("error"); return;
    }
    setFileName(file.name);
    setStatus("parsing");
    setErrorMsg("");

    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });

      // Try each sheet — find the one with the most matched accounts
      let bestRows = [];
      for (const sheetName of wb.SheetNames) {
        const ws   = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (data.length < 2) continue;

        // Find header row (first row with recognizable column names)
        let headerIdx = 0;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i].map(String);
          if (row.some(c => /expense|account|name|amount|balance|paid|due/i.test(c))) {
            headerIdx = i; break;
          }
        }

        const headers = data[headerIdx].map(String);
        const nameCol    = matchColumn(headers, ["expense","account","name"]);
        const balCol     = matchColumn(headers, ["balance","bal"]);
        const minDueCol  = matchColumn(headers, ["mindue","minimumdueamount","minimumpayment","amount","mindueamt"]);
        const paidCol    = matchColumn(headers, ["amtpaid","amountpaid","paid","actualpaid"]);
        const isPaidCol  = matchColumn(headers, ["paid","ispaid","markedpaid"]);
        const purchCol   = matchColumn(headers, ["newpurchases","purchases","purch"]);
        const aprCol     = matchColumn(headers, ["apr","rate","interestrate"]);

        const parsed = [];
        for (let i = headerIdx + 1; i < data.length; i++) {
          const row  = data[i];
          const name = String(row[nameCol] ?? "").trim();
          if (!name) continue;

          // Skip section headers, subtotals, and summary rows — not real accounts
          const skipPatterns = [
            /subtotal/i, /^credit cards$/i, /^student loans$/i, /^personal loans$/i,
            /^line of credit$/i, /^insurance$/i, /^subscriptions$/i, /^home expenses$/i,
            /^utilities$/i, /^business$/i, /^storage$/i, /^household$/i,
            /total expenditure/i, /total with stallion/i, /stallion bills/i,
            /monthly savings goal/i, /^total income$/i, /^eagleview$/i, /^boa$/i,
            /net \(with/i, /net \(without/i, /net after savings/i, /^0$/,
          ];
          if (skipPatterns.some(p => p.test(name))) continue;

          const matched = fuzzyMatch(name, accounts);
          parsed.push({
            rowNum:    i + 1,
            rawName:   name,
            matched,
            balance:   balCol    >= 0 ? parseMoney(row[balCol])    : null,
            min_due:   minDueCol >= 0 ? parseMoney(row[minDueCol]) : null,
            paid_v:    paidCol   >= 0 ? parseMoney(row[paidCol])   : null,
            is_paid:   isPaidCol >= 0 ? parseBool(row[isPaidCol])  : false,
            purch_v:   purchCol  >= 0 ? parseMoney(row[purchCol])  : null,
            apr_v:     aprCol    >= 0 ? parseMoney(row[aprCol])    : null,
            include:   !!matched,
          });
        }

        const matchCount = parsed.filter(r => r.matched).length;
        if (matchCount > bestRows.filter(r => r.matched).length) {
          bestRows = parsed;
        }
      }

      if (bestRows.length === 0) {
        setErrorMsg("No data rows found. Make sure your file has an account name column.");
        setStatus("error"); return;
      }

      setRows(bestRows);
      setStatus("preview");
    } catch (err) {
      setErrorMsg(`Error reading file: ${err?.message || err}`);
      setStatus("error");
    }
  };

  const toggleRow = (idx) => {
    setRows(r => r.map((row, i) => i === idx ? {...row, include: !row.include} : row));
  };

  const handleImport = async () => {
    const toImport = rows.filter(r => r.include && r.matched);
    if (!toImport.length) return;
    setImporting(true);
    let count = 0;
    const auditRows = [];
    for (const row of toImport) {
      const acct = row.matched;
      const updates = {
        cur_bal:   row.balance  ?? acct.starting_bal,
        min_due_v: row.min_due  ?? acct.budgeted_min,
        paid_v:    row.paid_v   ?? 0,
        is_paid:   row.is_paid  ?? false,
        purch_v:   row.purch_v  ?? 0,
        apr_v:     row.apr_v    ?? acct.apr,
      };
      // capture before snapshot from provided `accounts` prop
      const before = (accounts||[]).find(a=>a.id===acct.id) || null;
      try {
        await (onImported ? onImported(acct.id, updates) : Promise.resolve());
        auditRows.push({ accountId: acct.id, name: acct.name, before, after: updates });
        count++;
        setDoneCount(count);
      } catch (e) {
        console.error(`Import failed for "${acct.name}":`, e);
        auditRows.push({ accountId: acct.id, name: acct.name, before, after: updates, error: e?.message || String(e) });
      }
    }
    setImporting(false);
    setStatus("done");
    if (onUpload) {
      try { onUpload({ fileName, type: "excel", rows: auditRows }); } catch(e){ console.error('onUpload error', e); }
    }
  };

  const reset = () => {
    setStatus("idle"); setRows([]); setFileName("");
    setErrorMsg(""); setDoneCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const matched   = rows.filter(r => r.matched);
  const unmatched = rows.filter(r => !r.matched);
  const selected  = rows.filter(r => r.include && r.matched);

  return (
    <div style={{maxWidth:900, margin:"0 auto"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:c.muted,marginBottom:6,fontFamily:"'Instrument Sans',sans-serif"}}>
          📊 Import from Excel / CSV
        </div>
        <div style={{fontSize:13,color:c.tx2}}>
          Upload your existing budget spreadsheet — balances, minimums, and paid status will be imported directly into Firebase.
        </div>
      </div>

      {/* Supported columns info */}
      <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:12,color:c.tx2}}>
        <div style={{fontWeight:700,marginBottom:6,color:c.tx}}>Expected columns (any order, auto-detected):</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"4px 16px"}}>
          {[["Account/Expense","Name of the account"],["Balance","Current balance"],["Min Due / Amount","Minimum payment due"],["Amt Paid","Amount already paid"],["Paid?","Yes/No paid status"],["New Purchases","New charges"],["APR","Interest rate"]].map(([col,desc])=>(
            <div key={col} style={{minWidth:200}}>
              <span style={{fontFamily:"'DM Mono',monospace",color:c.ac,fontWeight:600}}>{col}</span>
              <span style={{color:c.muted}}> — {desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      {(status==="idle" || status==="error") && (
        <>
          <div
            onClick={()=>fileRef.current?.click()}
            onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files?.[0]);}}
            onDragOver={e=>e.preventDefault()}
            style={{border:`2px dashed ${status==="error"?c.da:c.border2}`,borderRadius:14,padding:"40px 24px",textAlign:"center",cursor:"pointer",background:c.surf,marginBottom:12,transition:"all .2s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
            onMouseLeave={e=>e.currentTarget.style.borderColor=status==="error"?c.da:c.border2}
          >
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div style={{fontWeight:700,fontSize:14,color:c.tx,marginBottom:4}}>Drop your Excel or CSV file here</div>
            <div style={{fontSize:12,color:c.muted}}>Supports .xlsx · .xls · .csv</div>
            {fileName && <div style={{marginTop:8,fontSize:12,color:c.ac,fontWeight:600}}>{fileName}</div>}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
          {status==="error" && (
            <div style={{padding:"12px 16px",borderRadius:10,background:c.daD,border:`1px solid ${c.da}`,color:c.da,fontSize:13}}> ⚠️ {errorMsg}</div>
          )}
        </>
      )}

      {/* Parsing */}
      {status==="parsing" && (
        <div style={{textAlign:"center",padding:"40px 0",color:c.muted}}>
          <div style={{fontSize:28,animation:"spin 1s linear infinite",display:"inline-block"}}>◈</div>
          <div style={{marginTop:10,fontSize:13}}>Reading {fileName}…</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Preview */}
      {status==="preview" && (
        <div>
          {/* Summary bar */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            {[
              {label:"Rows Found",   val:rows.length,       color:c.tx},
              {label:"Auto-Matched", val:matched.length,    color:c.go},
              {label:"Unmatched",    val:unmatched.length,  color:unmatched.length?c.wa:c.muted},
            ].map(({label,val,color})=>(
              <div key={label} style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:500,color}}>{val}</div>
                <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginTop:4,fontFamily:"'Instrument Sans',sans-serif"}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Matched rows */}
          {matched.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:8,fontFamily:"'Instrument Sans',sans-serif"}}>
                ✓ Matched Accounts — select which to import
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${c.border}`}}>
                      {["","Excel Name","→ Matched Account","Confidence","Balance","Min Due","Paid","Is Paid"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,fontFamily:"'Instrument Sans',sans-serif"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${c.border}`,background:row.include?c.goD:"transparent",cursor:"pointer",transition:"background .1s"}}
                        onClick={()=>toggleRow(rows.indexOf(row))}>
                        <td style={{padding:"8px 10px"}}>
                          <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${row.include?c.go:c.border2}`,background:row.include?c.go:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {row.include && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </td>
                        <td style={{padding:"8px 10px",color:c.tx2}}>{row.rawName}</td>
                        <td style={{padding:"8px 10px",fontWeight:600,color:c.tx}}>{row.matched?.name}</td>
                        <td style={{padding:"8px 10px"}}>
                          {row.matched?._matchConfidence && (
                            <span style={{
                              padding:"2px 7px",borderRadius:99,fontSize:10,fontWeight:800,
                              letterSpacing:"0.05em",fontFamily:"'Instrument Sans',sans-serif",
                              background: row.matched._matchConfidence==="Exact" ? c.goD : row.matched._matchConfidence==="Good" ? c.acD : c.daD,
                              color: row.matched._matchConfidence==="Exact" ? c.go : row.matched._matchConfidence==="Good" ? c.ac : c.da,
                              border: `1px solid ${row.matched._matchConfidence==="Exact" ? c.go : row.matched._matchConfidence==="Good" ? c.ac : c.da}`,
                            }}>
                              {row.matched._matchConfidence}
                            </span>
                          )}
                        </td>
                        <td style={{padding:"8px 10px",fontFamily:"'DM Mono',monospace",color:c.ac}}>{fxLocal(row.balance)}</td>
                        <td style={{padding:"8px 10px",fontFamily:"'DM Mono',monospace"}}>{fxLocal(row.min_due)}</td>
                        <td style={{padding:"8px 10px",fontFamily:"'DM Mono',monospace",color:c.go}}>{fxLocal(row.paid_v)}</td>
                        <td style={{padding:"8px 10px",color:row.is_paid?c.go:c.muted}}>{row.is_paid?"✓ Yes":"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched rows */}
          {unmatched.length > 0 && (
            <div style={{marginBottom:16,padding:"12px 16px",background:c.surf,border:`1px solid ${c.border}`,borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.wa,marginBottom:8,fontFamily:"'Instrument Sans',sans-serif"}}>
                ⚠️ Could not match these rows (will be skipped)
              </div>
              {unmatched.map((row,i)=>(
                <div key={i} style={{fontSize:12,color:c.muted,padding:"2px 0"}}>• {row.rawName}</div>
              ))}
            </div>
          )}

          <div style={{display:"flex",gap:10,marginTop:8}}>
            <button style={btn(c.surf2,c.tx2)} onClick={reset}>← Start Over</button>
            <button
              style={{...btn(c.ac,"#000",!selected.length), flex:1}}
              disabled={!selected.length}
              onClick={handleImport}
            >
              {importing
                ? `Saving ${doneCount}/${selected.length}…`
                : `☁ Import ${selected.length} Account${selected.length!==1?"s":""} to Firebase`
              }
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {status==="done" && (
        <div style={{textAlign:"center",padding:"40px 24px"}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontWeight:700,fontSize:16,color:c.tx,marginBottom:6}}>{doneCount} accounts imported!</div>
          <div style={{fontSize:13,color:c.muted,marginBottom:20}}>All data saved to Firebase. Your dashboard is now up to date.</div>
          <button style={btn(c.ac)} onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
