import { useState, useCallback } from "react";
import {
  TEST_RECIPES, runVerification,
  type VerifyResult, type VerifyLocation, type CreatedRecord,
} from "@/modules/factory/services/e2eVerifierService";

// ══════════════════════════════════════════════════════════════════════════════
// E2E Document Verifier — Agent creates real ERP data + verifies ALL locations
// ══════════════════════════════════════════════════════════════════════════════

const MOD_COLORS: Record<string, { color: string; label: string }> = {
  STORE:   { color: "#27AE60", label: "Material Mgmt" },
  SALES:   { color: "#2980B9", label: "Sales" },
  HR:      { color: "#E67E22", label: "HR / Payroll" },
  FINANCE: { color: "#1A3A5C", label: "Finance" },
};

// ── Created Record Card ─────────────────────────────────────────────────────
function CreatedCard({ rec, moduleColor }: { rec: CreatedRecord; moduleColor: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      borderRadius: 12, padding: "16px 20px", marginBottom: 16,
      background: `${moduleColor}10`, border: `2px solid ${moduleColor}55`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 10,
              background: `${moduleColor}22`, color: moduleColor, fontWeight: 700, border: `1px solid ${moduleColor}44`,
            }}>CREATED BY AGENT</span>
            <span style={{ fontSize: 10, color: "#667788" }}>
              {new Date(rec.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: moduleColor, fontFamily: "monospace", marginBottom: 4 }}>
            {rec.id}
          </div>
          <div style={{ fontSize: 11, color: "#AABBCC", lineHeight: 1.5 }}>{rec.summary}</div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: "none", border: `1px solid ${moduleColor}44`, borderRadius: 6,
            color: moduleColor, fontSize: 9, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {expanded ? "HIDE DATA" : "VIEW DATA"}
        </button>
      </div>

      {expanded && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 8,
          background: "#0D1B2A", border: "1px solid #2C3E50",
          fontFamily: "monospace", fontSize: 9, color: "#8BBBDD",
          maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {JSON.stringify(rec.data, null, 2)}
        </div>
      )}
    </div>
  );
}

// ── Location Card ───────────────────────────────────────────────────────────
function LocationCard({ loc, idx }: { loc: VerifyLocation; idx: number }) {
  const allPass = loc.found && loc.fields.every(f => f.match);
  const color   = allPass ? "#27AE60" : loc.found ? "#F39C12" : "#E74C3C";
  const label   = allPass ? "VERIFIED" : loc.found ? "PARTIAL" : "NOT FOUND";

  return (
    <div style={{
      border: `2px solid ${color}44`, borderRadius: 10, padding: "12px 16px",
      background: `${color}08`, marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: `${color}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}44`,
          }}>{idx + 1}</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#E0E0E0" }}>{loc.name}</div>
            <div style={{ fontSize: 8, color: "#667788" }}>{loc.source} | {loc.latencyMs}ms</div>
          </div>
        </div>
        <span style={{
          fontSize: 8, padding: "3px 10px", borderRadius: 10,
          background: `${color}22`, color, fontWeight: 700, border: `1px solid ${color}44`,
        }}>{label}</span>
      </div>

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
                {f.match ? "✓" : "✗"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Result Summary ──────────────────────────────────────────────────────────
function ResultSummary({ result }: { result: VerifyResult }) {
  const color = result.status === 'pass' ? "#27AE60" : result.status === 'partial' ? "#F39C12" : "#E74C3C";
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12, marginBottom: 16,
      background: `${color}10`, border: `2px solid ${color}44`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>
          {result.status === 'pass'    ? 'ALL LOCATIONS VERIFIED' :
           result.status === 'partial' ? 'PARTIAL — SOME LOCATIONS MISSING' :
                                         'FAILED — DATA NOT FOUND'}
        </div>
        <div style={{ fontSize: 10, color: "#8899AA", marginTop: 2 }}>
          {result.testName} | ID: {result.createdId} | {result.duration}ms
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { val: result.passedLocations,  label: "VERIFIED",  col: "#27AE60" },
          { val: result.failedLocations,  label: "MISSING",   col: "#E74C3C" },
          { val: result.totalLocations,   label: "TOTAL",     col: "#8899AA" },
        ].map(({ val, label, col }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#667788" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Flow Steps Indicator ────────────────────────────────────────────────────
function FlowIndicator({ phase }: { phase: 'idle' | 'creating' | 'verifying' | 'done' }) {
  const steps = [
    { key: 'creating',  label: 'Agent Creates Record' },
    { key: 'verifying', label: 'Checks All Locations' },
    { key: 'done',      label: 'Results Ready' },
  ] as const;
  const activeIdx = phase === 'creating' ? 0 : phase === 'verifying' ? 1 : phase === 'done' ? 2 : -1;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16 }}>
      {steps.map((s, i) => {
        const isPast   = i < activeIdx;
        const isActive = i === activeIdx;
        const col = isPast ? "#27AE60" : isActive ? "#F39C12" : "#2C3E50";
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: isActive ? "#F39C1222" : isPast ? "#27AE6022" : "#2C3E5033",
                border: `2px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: col,
              }}>
                {isPast ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 8, color: col, whiteSpace: "nowrap", fontWeight: isActive ? 700 : 400 }}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: isPast ? "#27AE60" : "#2C3E50", margin: "0 4px", marginTop: -12 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function E2EVerifier() {
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [inputs, setInputs]             = useState<Record<string, any>>({});
  const [phase, setPhase]               = useState<'idle' | 'creating' | 'verifying' | 'done'>('idle');
  const [createdRecord, setCreatedRecord] = useState<CreatedRecord | null>(null);
  const [result, setResult]             = useState<VerifyResult | null>(null);
  const [liveLocations, setLiveLocations] = useState<VerifyLocation[]>([]);

  const recipe = activeRecipe ? TEST_RECIPES.find(r => r.id === activeRecipe) : null;
  const mc = recipe ? (MOD_COLORS[recipe.module] || { color: "#667788", label: recipe.module }) : null;
  const running = phase === 'creating' || phase === 'verifying';

  const setInput = useCallback((key: string, val: any) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  }, []);

  const runTest = useCallback(async () => {
    if (!recipe || running) return;
    setPhase('creating');
    setResult(null);
    setCreatedRecord(null);
    setLiveLocations([]);

    try {
      const res = await runVerification(
        recipe.id,
        inputs,
        (loc) => setLiveLocations(prev => [...prev, loc]),
        true,  // autoCreate = true
        (rec) => {
          setCreatedRecord(rec);
          setPhase('verifying');
        },
      );
      setResult(res);
      setPhase('done');
    } catch (err) {
      console.error('[E2E] Create & Verify failed:', err);
      setPhase('idle');
    }
  }, [recipe, inputs, running]);

  const selectRecipe = (id: string) => {
    setActiveRecipe(id);
    setInputs({});
    setResult(null);
    setCreatedRecord(null);
    setLiveLocations([]);
    setPhase('idle');
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
          Agent data khud create karega — aap sirf values enter karo aur CREATE & VERIFY dabao | {TEST_RECIPES.length} Recipes | Supabase + localStorage
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: "#1B2B3A", padding: "8px 24px", borderBottom: "1px solid #2C3E50", fontSize: 10, color: "#8899AA" }}>
        <strong style={{ color: "#F39C12" }}>How it works:</strong> 1) Recipe select karo →
        2) Test values enter karo (company, amount, etc.) →
        3) <strong style={{ color: "#27AE60" }}>"CREATE & VERIFY"</strong> click karo →
        4) Agent real ERP record banata hai via service functions →
        5) Phir automatically verify karta hai ke data sari jagah pahuncha
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 84px)" }}>
        {/* Left: Recipe List */}
        <div style={{ width: 300, background: "#1B2B3A", borderRight: "1px solid #2C3E50", overflowY: "auto", padding: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>
            VERIFICATION RECIPES ({TEST_RECIPES.length})
          </div>
          {Object.entries(grouped).map(([mod, recipes]) => {
            const modColor = MOD_COLORS[mod] || { color: "#667788", label: mod };
            return (
              <div key={mod} style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: modColor.color, letterSpacing: 1,
                  marginBottom: 4, padding: "2px 8px", background: `${modColor.color}18`, borderRadius: 6, display: "inline-block",
                }}>
                  {modColor.label}
                </div>
                {recipes.map(r => {
                  const isActive = activeRecipe === r.id;
                  return (
                    <div key={r.id} onClick={() => selectRecipe(r.id)} style={{
                      padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                      background: isActive ? `${modColor.color}18` : "#0D1B2A",
                      border: `1.5px solid ${isActive ? modColor.color : "#2C3E5044"}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isActive ? modColor.color : "#AABBCC" }}>{r.name}</div>
                      <div style={{ fontSize: 8, color: "#667788", marginTop: 2 }}>{r.description.slice(0, 80)}...</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Center: Form + Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!recipe ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#667788" }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>{"[A]"}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#8899AA", marginBottom: 6 }}>Agent ready — recipe select karo</div>
              <div style={{ fontSize: 11, textAlign: "center", maxWidth: 500, lineHeight: 1.6 }}>
                Left side se koi bhi recipe select karo. Agent automatically ERP mein real record create karega,
                phir verify karega ke data localStorage, Supabase, aur sari downstream tables mein correctly pahuncha.
                Aapko koi ID manually enter nahi karni — agent sab kuch khud sambhalega.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 700 }}>
              {/* Recipe Header */}
              <div style={{ padding: "14px 20px", borderRadius: 12, marginBottom: 16, background: "#1B2B3A", border: "1px solid #2C3E50" }}>
                <div style={{ fontSize: 9, color: mc!.color, fontWeight: 700, letterSpacing: 1 }}>{recipe.module}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#E0E0E0", marginTop: 2 }}>{recipe.name}</div>
                <div style={{ fontSize: 10, color: "#8899AA", marginTop: 4 }}>{recipe.description}</div>
              </div>

              {/* Flow Indicator */}
              {phase !== 'idle' && <FlowIndicator phase={phase} />}

              {/* Input Form */}
              <div style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 16, background: "#1B2B3A", border: "1px solid #2C3E50" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>
                  TEST PARAMETERS
                  <span style={{ marginLeft: 8, fontSize: 9, color: "#445566", fontWeight: 400, textTransform: "none" }}>
                    — agent will generate the document ID automatically
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {recipe.inputs.map(inp => (
                    <div key={inp.key}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#8899AA", marginBottom: 3 }}>{inp.label}</div>
                      {inp.type === 'select' ? (
                        <select
                          value={inputs[inp.key] || ''}
                          onChange={e => setInput(inp.key, e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #2C3E5088", background: "#0D1B2A", color: "#E0E0E0", fontSize: 11 }}
                        >
                          <option value="">-- select --</option>
                          {inp.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={inp.type}
                          value={inputs[inp.key] || ''}
                          placeholder={inp.placeholder}
                          onChange={e => setInput(inp.key, inp.type === 'number' ? Number(e.target.value) : e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #2C3E5088", background: "#0D1B2A", color: "#E0E0E0", fontSize: 11, boxSizing: "border-box" }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={runTest} disabled={running} style={{
                  marginTop: 14, width: "100%", padding: "13px",
                  borderRadius: 8, border: "none",
                  background: running ? "#2C3E50" : mc!.color,
                  color: "white", fontSize: 13, fontWeight: 700,
                  cursor: running ? "wait" : "pointer", letterSpacing: 1,
                  transition: "background 0.2s",
                }}>
                  {phase === 'creating'  ? "CREATING RECORD..." :
                   phase === 'verifying' ? "VERIFYING LOCATIONS..." :
                   phase === 'done'      ? "RUN AGAIN" :
                                           "CREATE & VERIFY ALL LOCATIONS"}
                </button>
              </div>

              {/* Created Record Card */}
              {createdRecord && mc && <CreatedCard rec={createdRecord} moduleColor={mc.color} />}

              {/* Result Summary */}
              {result && <ResultSummary result={result} />}

              {/* Live Location Checks */}
              {(liveLocations.length > 0 || phase === 'verifying') && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#667788", letterSpacing: 1, marginBottom: 8 }}>
                    LOCATION CHECKS ({liveLocations.length}{phase === 'verifying' ? '...' : ''})
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
