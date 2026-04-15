import { useState, useCallback } from "react";
import { TEST_RECIPES, runVerification, type VerifyResult, type VerifyLocation } from "@/modules/factory/services/e2eVerifierService";

// ══════════════════════════════════════════════════════════════════════════════
// E2E Document Verifier — Create entry in ERP, agent verifies ALL locations
// ══════════════════════════════════════════════════════════════════════════════

const MOD_COLORS: Record<string, { color: string; label: string }> = {
  STORE:   { color: "#27AE60", label: "Material Mgmt" },
  SALES:   { color: "#2980B9", label: "Sales" },
  HR:      { color: "#E67E22", label: "HR / Payroll" },
  FINANCE: { color: "#1A3A5C", label: "Finance" },
};

function LocationCard({ loc, idx }: { loc: VerifyLocation; idx: number }) {
  const allPass = loc.found && loc.fields.every(f => f.match);
  const color = allPass ? "#27AE60" : loc.found ? "#F39C12" : "#E74C3C";
  const label = allPass ? "VERIFIED" : loc.found ? "PARTIAL" : "NOT FOUND";

  return (
    <div style={{
      border: `2px solid ${color}44`, borderRadius: 10, padding: "12px 16px",
      background: `${color}08`, marginBottom: 8
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: `${color}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}44`
          }}>{idx + 1}</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#E0E0E0" }}>{loc.name}</div>
            <div style={{ fontSize: 8, color: "#667788" }}>{loc.source} | {loc.latencyMs}ms</div>
          </div>
        </div>
        <span style={{
          fontSize: 8, padding: "3px 10px", borderRadius: 10,
          background: `${color}22`, color, fontWeight: 700, border: `1px solid ${color}44`
        }}>{label}</span>
      </div>

      {/* Field checks */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Field", "Expected", "Actual", ""].map(h => (
              <th key={h} style={{ fontSize: 8, color: "#667788", textAlign: "left", padding: "3px 6px", borderBottom: "1px solid #2C3E50" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loc.fields.map((f, i) => (
            <tr key={i}>
              <td style={{ fontSize: 9, padding: "3px 6px", color: "#AABBCC", fontFamily: "monospace" }}>{f.field}</td>
              <td style={{ fontSize: 9, padding: "3px 6px", color: "#8899AA" }}>{f.expected === '*' ? 'any value' : String(f.expected)}</td>
              <td style={{ fontSize: 9, padding: "3px 6px", color: "#E0E0E0", fontFamily: "monospace", fontWeight: 600 }}>
                {f.actual === null ? <span style={{ color: "#E74C3C" }}>null</span> : String(f.actual)}
              </td>
              <td style={{ fontSize: 10, padding: "3px 6px", color: f.match ? "#27AE60" : "#E74C3C", fontWeight: 700 }}>
                {f.match ? "V" : "X"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultSummary({ result }: { result: VerifyResult }) {
  const color = result.status === 'pass' ? "#27AE60" : result.status === 'partial' ? "#F39C12" : "#E74C3C";
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12, marginBottom: 16,
      background: `${color}10`, border: `2px solid ${color}44`,
      display: "flex", justifyContent: "space-between", alignItems: "center"
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>
          {result.status === 'pass' ? 'ALL LOCATIONS VERIFIED' :
           result.status === 'partial' ? 'PARTIAL — SOME LOCATIONS MISSING' :
           'FAILED — DATA NOT FOUND'}
        </div>
        <div style={{ fontSize: 10, color: "#8899AA", marginTop: 2 }}>
          {result.testName} | ID: {result.createdId} | {result.duration}ms
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#27AE60" }}>{result.passedLocations}</div>
          <div style={{ fontSize: 8, color: "#667788" }}>FOUND</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#E74C3C" }}>{result.failedLocations}</div>
          <div style={{ fontSize: 8, color: "#667788" }}>MISSING</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#8899AA" }}>{result.totalLocations}</div>
          <div style={{ fontSize: 8, color: "#667788" }}>TOTAL</div>
        </div>
      </div>
    </div>
  );
}

export default function E2EVerifier() {
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [liveLocations, setLiveLocations] = useState<VerifyLocation[]>([]);

  const recipe = activeRecipe ? TEST_RECIPES.find(r => r.id === activeRecipe) : null;

  const setInput = useCallback((key: string, val: any) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  }, []);

  const runTest = useCallback(async () => {
    if (!recipe || running) return;
    setRunning(true);
    setResult(null);
    setLiveLocations([]);

    try {
      const res = await runVerification(recipe.id, inputs, (loc, idx) => {
        setLiveLocations(prev => [...prev, loc]);
      });
      setResult(res);
    } catch (err) {
      console.error('[E2E] Verification failed:', err);
    } finally {
      setRunning(false);
    }
  }, [recipe, inputs, running]);

  const selectRecipe = (id: string) => {
    setActiveRecipe(id);
    setInputs({});
    setResult(null);
    setLiveLocations([]);
  };

  // Group recipes by module
  const grouped = TEST_RECIPES.reduce((acc, r) => {
    (acc[r.module] = acc[r.module] || []).push(r);
    return acc;
  }, {} as Record<string, typeof TEST_RECIPES>);

  return (
    <div style={{ fontFamily: "'Segoe UI',Calibri,sans-serif", background: "#0D1B2A", minHeight: "100vh", color: "#E0E0E0" }}>
      {/* Header */}
      <div style={{ background: "#1B2B3A", padding: "14px 24px", borderBottom: "2px solid #2C3E50" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
          GlassTech ERP — E2E Document Verifier
        </div>
        <div style={{ fontSize: 10, color: "#667788", marginTop: 2 }}>
          ERP mein entry karo, phir agent verify karega ke data sari jagah correctly pahuncha | {TEST_RECIPES.length} Verification Recipes | Supabase + localStorage
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: "#1B2B3A", padding: "8px 24px", borderBottom: "1px solid #2C3E50", fontSize: 10, color: "#8899AA" }}>
        <strong style={{ color: "#F39C12" }}>How it works:</strong> 1) ERP mein manually entry create karo (e.g., Requisition) →
        2) Yahan ID enter karo → 3) "VERIFY" click karo →
        4) Agent check karega: localStorage, Supabase, downstream tables, GL entries sab
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 84px)" }}>
        {/* Left: Recipe Selection */}
        <div style={{ width: 300, background: "#1B2B3A", borderRight: "1px solid #2C3E50", overflowY: "auto", padding: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>
            VERIFICATION RECIPES ({TEST_RECIPES.length})
          </div>
          {Object.entries(grouped).map(([mod, recipes]) => {
            const mc = MOD_COLORS[mod] || { color: "#667788", label: mod };
            return (
              <div key={mod} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: mc.color, letterSpacing: 1, marginBottom: 4, padding: "2px 8px", background: `${mc.color}18`, borderRadius: 6, display: "inline-block" }}>
                  {mc.label}
                </div>
                {recipes.map(r => {
                  const isActive = activeRecipe === r.id;
                  return (
                    <div key={r.id} onClick={() => selectRecipe(r.id)} style={{
                      padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                      background: isActive ? `${mc.color}18` : "#0D1B2A",
                      border: `1.5px solid ${isActive ? mc.color : "#2C3E5044"}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isActive ? mc.color : "#AABBCC" }}>{r.name}</div>
                      <div style={{ fontSize: 8, color: "#667788", marginTop: 2 }}>{r.description.slice(0, 80)}...</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Center: Input Form + Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!recipe ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#667788" }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>{"[?]"}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#8899AA", marginBottom: 6 }}>Kya verify karna hai?</div>
              <div style={{ fontSize: 11, textAlign: "center", maxWidth: 500, lineHeight: 1.6 }}>
                Pehle ERP mein entry create karo (requisition, quotation, attendance, etc.).
                Phir yahan recipe select karo, document ID enter karo, aur VERIFY click karo.
                Agent automatically check karega ke data sari downstream tables mein pahuncha ya nahi.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 700 }}>
              {/* Recipe Header */}
              <div style={{
                padding: "14px 20px", borderRadius: 12, marginBottom: 16,
                background: "#1B2B3A", border: "1px solid #2C3E50"
              }}>
                <div style={{ fontSize: 9, color: MOD_COLORS[recipe.module]?.color || "#667788", fontWeight: 700, letterSpacing: 1 }}>{recipe.module}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#E0E0E0", marginTop: 2 }}>{recipe.name}</div>
                <div style={{ fontSize: 10, color: "#8899AA", marginTop: 4 }}>{recipe.description}</div>
              </div>

              {/* Input Form */}
              <div style={{
                padding: "16px 20px", borderRadius: 12, marginBottom: 16,
                background: "#1B2B3A", border: "1px solid #2C3E50"
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>
                  ENTER DOCUMENT DETAILS (from your ERP entry)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {recipe.inputs.map(inp => (
                    <div key={inp.key}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#8899AA", marginBottom: 3 }}>{inp.label}</div>
                      {inp.type === 'select' ? (
                        <select value={inputs[inp.key] || ''} onChange={e => setInput(inp.key, e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #2C3E5088", background: "#0D1B2A", color: "#E0E0E0", fontSize: 11 }}>
                          <option value="">-- select --</option>
                          {inp.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={inp.type} value={inputs[inp.key] || ''} placeholder={inp.placeholder}
                          onChange={e => setInput(inp.key, inp.type === 'number' ? Number(e.target.value) : e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #2C3E5088", background: "#0D1B2A", color: "#E0E0E0", fontSize: 11, boxSizing: "border-box" }} />
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={runTest} disabled={running} style={{
                  marginTop: 14, width: "100%", padding: "12px", borderRadius: 8, border: "none",
                  background: running ? "#2C3E50" : "#27AE60", color: "white",
                  fontSize: 13, fontWeight: 700, cursor: running ? "wait" : "pointer",
                  letterSpacing: 1
                }}>
                  {running ? "VERIFYING..." : "VERIFY ALL LOCATIONS"}
                </button>
              </div>

              {/* Live Results */}
              {result && <ResultSummary result={result} />}

              {(liveLocations.length > 0 || running) && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 8 }}>
                    LOCATION CHECKS ({liveLocations.length}{running ? '...' : ''})
                  </div>
                  {liveLocations.map((loc, i) => (
                    <LocationCard key={i} loc={loc} idx={i} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
