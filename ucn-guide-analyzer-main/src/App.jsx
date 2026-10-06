import { useState } from "react";

// ─── Physical constants (CODATA 2018) ────────────────────────────────────────
const C = {
  HBAR: 1.054571817e-34,   // J·s
  MN:   1.67492749804e-27, // kg
  EV:   1.602176634e-19,   // J
  NA:   6.02214076e23,     // 1/mol
  G:    9.80665,           // m/s²
  V0:   2200,              // m/s, reference speed of tabulated absorption cross sections
};
const NEV = 1e-9 * C.EV;           // 1 neV in J
const MU_N = 60.3;                 // neV/T, |neutron magnetic moment| (Sidhu et al., arXiv:2212.04958)
const TAU_BETA = 878.4;            // s, PDG 2024 (878.4 ± 0.5, S = 1.8)

// ─── Core physics ────────────────────────────────────────────────────────────
// V_F = (2πħ²/m) · N · b_c
const vfNeV   = (N28, bcFm) => (C.HBAR ** 2 / (2 * C.MN)) * 4 * Math.PI * (N28 * 1e28) * (bcFm * 1e-15) / NEV;
// v_c = sqrt(2 V_F / m)
const vcMs    = (vfneV) => Math.sqrt(2 * vfneV * NEV / C.MN);
// η_abs = W/V with W = (ħ/2) N σ_abs(v0) v0  →  η_abs = m σ v0 / (4π ħ b_c)   (1/v absorption only)
const etaAbs  = (bcFm, sigBarn) => (C.MN * sigBarn * 1e-28 * C.V0) / (4 * Math.PI * C.HBAR * bcFm * 1e-15);
// number density (units of 1e28 m⁻³) from mass density (g/cm³) and molar mass (g/mol)
const nFromRho = (rho, M) => (rho * C.NA / M) * 1e6 / 1e28;
// Loss probability per bounce averaged over an isotropic UCN flux (Golub & Pendlebury 1979):
//   μ̄(E) = 2η [ (V/E)·asin√(E/V) − √(V/E − 1) ]      → (4/3)η√(E/V) for E ≪ V
function muAvg(eta, E, V) {
  const x = Math.sqrt(E / V);
  if (x < 0.02) return (4 / 3) * eta * x;
  return 2 * eta * (Math.asin(x) / (x * x) - Math.sqrt(1 / (x * x) - 1));
}

// ─── Material data ───────────────────────────────────────────────────────────
// kind "calc": V_F, v_c and η_abs are COMPUTED from ρ, M, b_c, σ_abs (Sears 1992 / NIST NCNR tables).
// kind "pub" : V_F and W_F are published input values (Sidhu et al., TUCAN, arXiv:2212.04958).
// etaMeas   : experimentally measured wall-loss coefficient (×10⁻⁴) where a source was verified.
const RAW = [
  { id: "dlc", name: "Diamond-Like Carbon", formula: "DLC", kind: "calc", rho: 2.9, M: 12.011, bc: 6.646, sig: 0.0035,
    etaMeas: 2.0, etaNote: "Measured on DLC foils: 0.7–1.7 at 70 K, about 2× higher at room temperature (Atchison 2007)",
    assume: "ρ ≈ 2.9 g/cm³ assumed (sp³-rich, H-free approximation) so that V_F ≈ 250 neV, consistent with the v_c ≈ 7 m/s reported from neutron reflectometry (Brys 2005). Real films vary with sp³ fraction, H content and density.",
    pros: "High V_F (~250 neV, v_c ≈ 7 m/s); non-toxic and hydrophobic; measured wall loss η ~ 10⁻⁴; very low depolarisation reported (β < 3×10⁻⁶ per bounce).",
    cons: "V_F and η depend strongly on deposition conditions (sp²/sp³ ratio, hydrogen content, density, stress). Surface hydrogen raises the loss coefficient. Adhesion and delamination must be controlled." },
  { id: "ni58", name: "Nickel-58", formula: "⁵⁸Ni", kind: "calc", rho: 8.908, M: 58.693, bc: 14.4, sig: 4.6, etaMeas: null,
    assume: "Number density taken equal to natural nickel (same lattice).",
    pros: "Highest V_F of the listed materials (computed ≈ 340 neV; ~347 neV is quoted for ⁵⁸Ni in TUCAN documentation). No incoherent scattering (σ_inc = 0).",
    cons: "Isotopic enrichment is costly. Ferromagnetic, which matters for polarised UCN and magnetic-field homogeneity." },
  { id: "ni", name: "Natural Nickel", formula: "Ni", kind: "calc", rho: 8.908, M: 58.693, bc: 10.3, sig: 4.49, etaMeas: null,
    assume: "Handbook density.",
    pros: "Widely available; mature PVD and electroplating processes; high V_F.",
    cons: "Natural Ni has incoherent scattering (σ_inc = 5.2 b) while ⁵⁸Ni has none, so ⁵⁸Ni is preferred for low-loss storage. Ferromagnetic." },
  { id: "diamond", name: "Diamond", formula: "C (diamond)", kind: "calc", rho: 3.515, M: 12.011, bc: 6.646, sig: 0.0035, etaMeas: null,
    assume: "Crystalline diamond density.",
    pros: "Very high V_F (~305 neV) and negligible absorption.",
    cons: "CVD diamond is expensive and limited to small areas, so it is impractical for long guides. Its V_F is below ⁵⁸Ni." },
  { id: "fomblin", name: "Fomblin (PFPE)", formula: "(C₃F₆O)ₙ", kind: "calc", rho: 1.9, M: 16.6, bc: 5.9665, sig: 0.006829, etaMeas: null,
    assume: "Mean-atom model of the (C₃F₆O)ₙ repeat unit; ρ = 1.9 g/cm³ is an assumption. Check against the manufacturer's data sheet.",
    pros: "Hydrogen-free fluorinated oil; used as the wall coating in Serebrov's neutron-lifetime trap, where wall losses were ≈ 1% of the β-decay rate (Serebrov 2008).",
    cons: "Low V_F (~107 neV) limits it to low-energy UCN. A liquid or grease, so suited to closed bottles rather than general guide coatings." },
  { id: "be", name: "Beryllium", formula: "Be", kind: "calc", rho: 1.848, M: 9.0122, bc: 7.79, sig: 0.0076,
    etaMeas: 5.0, etaNote: "Measured at room temperature, η ≈ 5×10⁻⁴ (Atchison 2007)",
    assume: "Handbook density (1.235×10²³ atoms/cm³).",
    pros: "High V_F (~250 neV) and very low absorption.",
    cons: "Toxic (beryllium dust is an inhalation hazard) and needs strict safety controls. Measured room-temperature η is higher than for DLC." },
  { id: "cr", name: "Chromium", formula: "Cr", kind: "calc", rho: 7.19, M: 51.996, bc: 3.635, sig: 3.05, etaMeas: null,
    assume: "Handbook density.",
    pros: "Inexpensive; commonly used as an adhesion layer in thin-film deposition.",
    cons: "Low V_F (~79 neV from N·b_c) and fairly high absorption, so it is not suited as a storage coating." },
  { id: "cu", name: "Copper", formula: "Cu", kind: "calc", rho: 8.96, M: 63.546, bc: 7.718, sig: 3.78, etaMeas: null,
    assume: "Handbook density.",
    pros: "Easy to electroplate or sputter; inexpensive.",
    cons: "V_F (~170 neV) is well below Ni, Be and DLC, so it is rarely a first-choice storage coating." },
  { id: "ti", name: "Titanium", formula: "Ti", kind: "calc", rho: 4.506, M: 47.867, bc: -3.438, sig: 6.09, etaMeas: null,
    assume: "Handbook density.",
    pros: "Negative coherent scattering length, so it is used with Ni in multilayer (supermirror) structures.",
    cons: "Negative V_F: it attracts rather than reflects UCN and cannot be used alone as a guide coating." },
  { id: "nip", name: "Electroless NiP", formula: "NiP (P > 10%)", kind: "pub", Vf: 213, Wf: 0.07, WfRange: "0.03–0.09",
    assume: "Published input values for TUCAN simulations (Sidhu et al. 2022, citing UCN experiments at TRIUMF, J-PARC and LANL). Not computed from N·b_c.",
    pros: "Baseline coating assumed for the TUCAN EDM apparatus; V_F ≈ 213 neV, W_F ≈ 0.07 neV.",
    cons: "The measured W_F range spans roughly a factor of three (0.03–0.09 neV). TUCAN intends to use DLC for its better expected performance." },
  { id: "dps", name: "Deuterated polystyrene", formula: "dPS", kind: "pub", Vf: 171, Wf: 0.047,
    assume: "Published input values for TUCAN simulations (Sidhu et al. 2022). Not computed from N·b_c.",
    pros: "Insulating; used for the EDM-cell insulator rings in the TUCAN apparatus model (V_F ≈ 171 neV, W_F ≈ 0.047 neV).",
    cons: "Lower V_F than NiP, Be or DLC. Check deuteration level and film quality for your own samples." },
];

const MAT = RAW.map(r => {
  if (r.kind === "pub") {
    const eta = (r.Wf / r.Vf) * 1e4;
    return { ...r, N: null, Vf: r.Vf, vc: vcMs(r.Vf), eta, etaSrc: "pub", etaAbsV: null };
  }
  const N = nFromRho(r.rho, r.M);
  const Vf = vfNeV(N, r.bc);
  const ea = Vf > 0 ? etaAbs(r.bc, r.sig) * 1e4 : null;
  const useMeas = r.etaMeas != null;
  return { ...r, N, Vf, vc: Vf > 0 ? vcMs(Vf) : null, etaAbsV: ea,
    eta: Vf > 0 ? (useMeas ? r.etaMeas : ea) : null, etaSrc: Vf > 0 ? (useMeas ? "meas" : "abs") : null };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const tagOf = (Vf) => (Vf < 0 ? "neg" : Vf >= 240 ? "hi" : Vf >= 100 ? "mid" : "lo");
function tagStyle(t) {
  if (t === "hi")  return { background: "rgba(0,200,150,0.12)", color: "#00c896", border: "1px solid rgba(0,200,150,0.25)" };
  if (t === "mid") return { background: "rgba(245,166,35,0.12)", color: "#f5a623", border: "1px solid rgba(245,166,35,0.25)" };
  if (t === "neg") return { background: "rgba(138,100,255,0.12)", color: "#a78bfa", border: "1px solid rgba(138,100,255,0.25)" };
  return { background: "rgba(224,82,82,0.12)", color: "#e05252", border: "1px solid rgba(224,82,82,0.25)" };
}
const tagLabel = (t) => ({ hi: "High V_F", mid: "Moderate V_F", neg: "Negative V_F", lo: "Low V_F" }[t]);
const vfColor = (v) => (v > 240 ? "#00c896" : v > 100 ? "#f5a623" : v > 0 ? "#4a9eff" : "#e05252");
const fmtEta = (x) => (x < 0.01 ? x.toExponential(1) : x.toFixed(x < 1 ? 2 : 1));
const etaLabel = (m) => (m.eta == null ? "N/A" : (m.etaSrc === "abs" ? "≥ " : "") + fmtEta(m.eta));
const etaSrcText = (m) => ({
  meas: "measured value (see source note)",
  pub:  "published W_F / V_F",
  abs:  "absorption only (lower bound): measured η is usually higher because of surface hydrogen and contamination",
}[m.etaSrc] || "");

// ─── Styles (object-based, no external CSS needed) ────────────────────────────
const S = {
  app:        { maxWidth: 780, margin: "0 auto", padding: "1.5rem 1rem 3rem", fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", fontSize: 14, color: "#e8eaf0", background: "#0e1117", minHeight: "100vh", lineHeight: 1.6 },
  header:     { borderBottom: "1px solid #2a3348", paddingBottom: "1rem", marginBottom: "1.5rem" },
  h1:         { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 500, color: "#00c896", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 },
  subhead:    { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8892a4", marginTop: 4 },
  tabWrap:    { display: "flex", gap: 2, marginBottom: "1.5rem", background: "#161b25", border: "1px solid #2a3348", borderRadius: 6, padding: 3 },
  tab:        (active) => ({ flex: 1, padding: "7px 6px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, letterSpacing: "0.04em", border: active ? "1px solid #2a3348" : "1px solid transparent", background: active ? "#1e2535" : "transparent", color: active ? "#e8eaf0" : "#8892a4", cursor: "pointer", borderRadius: 4, transition: "all 0.15s" }),
  secLabel:   { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a5568", marginBottom: "0.75rem", paddingBottom: 4, borderBottom: "1px solid #2a3348" },
  matGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: "1.5rem" },
  matBtn:     (active) => ({ background: "#161b25", border: active ? "1px solid #00c896" : "1px solid #2a3348", borderRadius: 6, padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", width: "100%" }),
  detailCard: { background: "#161b25", border: "1px solid #2a3348", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" },
  metrics:    { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: "1rem" },
  metric:     { background: "#1e2535", border: "1px solid #2a3348", borderRadius: 5, padding: "10px 12px" },
  propRow:    { display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #2a3348", fontSize: 13 },
  barRow:     { display: "flex", alignItems: "center", gap: 10, margin: "5px 0" },
  barTrack:   { flex: 1, background: "#1e2535", borderRadius: 3, height: 14, overflow: "hidden", border: "1px solid #2a3348" },
  calcGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1rem" },
  field:      { display: "flex", flexDirection: "column", gap: 5 },
  input:      { background: "#1e2535", border: "1px solid #2a3348", borderRadius: 5, padding: "8px 10px", color: "#e8eaf0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, outline: "none", width: "100%" },
  select:     { background: "#1e2535", border: "1px solid #2a3348", borderRadius: 5, padding: "8px 10px", color: "#e8eaf0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, outline: "none", width: "100%" },
  resultBox:  { background: "#1e2535", border: "1px solid #2a3348", borderRadius: 6, padding: "1rem", marginTop: "1rem" },
  resultRow:  { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" },
  infoBox:    { background: "#161b25", borderLeft: "3px solid #4a9eff", borderRadius: "0 6px 6px 0", padding: "0.875rem 1rem", margin: "1rem 0", fontSize: 12, color: "#8892a4", lineHeight: 1.7, border: "1px solid #2a3348" },
  warnBox:    { background: "#161b25", borderLeft: "3px solid #f5a623", borderRadius: "0 6px 6px 0", padding: "0.875rem 1rem", margin: "1rem 0", fontSize: 12, color: "#8892a4", lineHeight: 1.7, border: "1px solid #2a3348" },
  formula:    { background: "#1e2535", border: "1px solid #2a3348", borderRadius: 5, padding: "0.75rem 1rem", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#4a9eff", margin: "0.75rem 0", lineHeight: 2 },
  tag:        (t) => ({ display: "inline-block", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", padding: "2px 6px", borderRadius: 3, fontWeight: 500, ...tagStyle(t) }),
  assumItem:  { display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #2a3348", fontSize: 13 },
  table:      { width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
  th:         { padding: "7px 10px", textAlign: "left", color: "#4a5568", fontWeight: 500, letterSpacing: "0.08em", borderBottom: "1px solid #2a3348", fontSize: 10, textTransform: "uppercase" },
  td:         { padding: "7px 10px", borderBottom: "1px solid #2a3348", color: "#e8eaf0" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const mono = "'IBM Plex Mono',monospace";
const Row = ({ k, v, hi }) => (
  <div style={{ ...S.resultRow, ...(hi ? { borderTop: "1px solid #2a3348", marginTop: 6, paddingTop: 8 } : {}) }}>
    <span style={{ fontFamily: mono, fontSize: 12, color: hi ? "#e8eaf0" : "#8892a4" }}>{k}</span>
    <span style={{ fontFamily: mono, fontSize: hi ? 18 : 14, fontWeight: 500, color: "#00c896" }}>{v}</span>
  </div>
);
const Field = ({ label, children }) => (
  <div style={S.field}>
    <label style={{ fontSize: 11, fontFamily: mono, color: "#8892a4", letterSpacing: "0.05em" }}>{label}</label>
    {children}
  </div>
);
const num = (setter, fallback = 0) => (e) => { const x = parseFloat(e.target.value); setter(Number.isFinite(x) ? x : fallback); };

function MaterialsTab({ selIdx, setSelIdx }) {
  const m = MAT[selIdx];
  const maxVf = Math.max(...MAT.map(x => x.Vf));
  const withEta = MAT.filter(x => x.eta);
  const maxEta = Math.max(...withEta.map(x => x.eta));

  return (
    <div>
      <div style={S.infoBox}>
        <strong style={{ color: "#e8eaf0" }}>How to read this:</strong> V_F (Fermi potential) is the highest UCN energy a flat wall of the material can reflect at normal incidence; higher is better. η is the loss coefficient (probability of loss per bounce is about η × a factor of order one); lower is better. Pick materials with high V_F <em>and</em> low η, then check practicality (toxicity, cost, deposition).
      </div>
      <div style={S.secLabel}>Select material</div>
      <div style={S.matGrid}>
        {MAT.map((mat, i) => (
          <button key={mat.id} style={S.matBtn(i === selIdx)} onClick={() => setSelIdx(i)}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#e8eaf0", marginBottom: 2 }}>{mat.name}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#8892a4", marginBottom: 6 }}>{mat.formula}</div>
            <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 500, color: vfColor(mat.Vf) }}>{Math.round(mat.Vf)}</div>
            <div style={{ fontSize: 10, color: "#8892a4" }}>neV</div>
          </button>
        ))}
      </div>

      <div style={S.detailCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#e8eaf0" }}>{m.name}</div>
            <div style={{ fontFamily: mono, fontSize: 12, color: "#8892a4" }}>{m.formula}</div>
          </div>
          <span style={S.tag(tagOf(m.Vf))}>{tagLabel(tagOf(m.Vf))}</span>
        </div>
        <div style={S.metrics}>
          {[
            ["V_F", m.Vf.toFixed(0), "neV"],
            ["v_c", m.vc ? m.vc.toFixed(2) : "N/A", "m/s"],
            ["η (×10⁻⁴)", etaLabel(m), ""],
            ["N", m.N ? m.N.toFixed(2) : "—", "×10²⁸ m⁻³"],
            ["b_c", m.kind === "calc" ? m.bc : "—", "fm"],
            ["σ_abs", m.kind === "calc" ? m.sig : "—", "barn"],
          ].map(([label, val, unit]) => (
            <div key={label} style={S.metric}>
              <div style={{ fontSize: 10, color: "#4a5568", fontFamily: mono, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 500, color: "#e8eaf0" }}>{val}</div>
              <div style={{ fontSize: 10, color: "#8892a4" }}>{unit}</div>
            </div>
          ))}
        </div>
        <div style={S.propRow}><span style={{ color: "#8892a4", minWidth: 160, flexShrink: 0 }}>Practical advantages</span><span>{m.pros}</span></div>
        <div style={S.propRow}><span style={{ color: "#8892a4", minWidth: 160, flexShrink: 0 }}>Limitations</span><span>{m.cons}</span></div>
        <div style={S.propRow}><span style={{ color: "#8892a4", minWidth: 160, flexShrink: 0 }}>η source</span><span>{m.eta ? etaSrcText(m) : "Not applicable (V_F < 0)."}{m.etaNote ? ` ${m.etaNote}.` : ""}{m.WfRange ? ` Measured W_F range ${m.WfRange} neV.` : ""}</span></div>
        <div style={{ ...S.propRow, borderBottom: "none" }}><span style={{ color: "#8892a4", minWidth: 160, flexShrink: 0 }}>Data basis</span><span>{m.assume}</span></div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={S.secLabel}>Fermi potential ranking</div>
        {[...MAT].sort((a, b) => b.Vf - a.Vf).map(mat => (
          <div key={mat.id} style={S.barRow}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#8892a4", width: 90, flexShrink: 0, textAlign: "right" }}>{mat.formula}</span>
            <div style={S.barTrack}>
              <div style={{ width: `${Math.max(0, mat.Vf / maxVf * 100).toFixed(1)}%`, height: "100%", borderRadius: 2, background: vfColor(mat.Vf), transition: "width 0.4s" }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#e8eaf0", width: 65, textAlign: "right" }}>{mat.Vf.toFixed(0)} neV</span>
          </div>
        ))}
      </div>

      <div>
        <div style={S.secLabel}>Loss factor η ranking (lower = better)</div>
        {[...withEta].sort((a, b) => a.eta - b.eta).map(mat => (
          <div key={mat.id} style={S.barRow}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#8892a4", width: 90, flexShrink: 0, textAlign: "right" }}>{mat.formula}</span>
            <div style={S.barTrack}>
              <div style={{ width: `${Math.max(1, mat.eta / maxEta * 100).toFixed(1)}%`, height: "100%", borderRadius: 2, background: mat.etaSrc === "abs" ? "#4a5568" : mat.eta < 3 ? "#00c896" : "#f5a623", transition: "width 0.4s" }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#e8eaf0", width: 65, textAlign: "right" }}>{etaLabel(mat)}</span>
          </div>
        ))}
        <div style={S.warnBox}>
          <strong style={{ color: "#e8eaf0" }}>Caution:</strong> grey bars (marked ≥) are computed from neutron absorption alone and are <em>lower bounds</em>. Real surfaces show larger losses, mainly from hydrogen contamination, so measured and published values (coloured bars) are not directly comparable to grey ones. Do not conclude that a grey-bar material beats a measured one.
        </div>
      </div>
    </div>
  );
}

function LifetimeTab() {
  const usable = MAT.filter(x => x.Vf > 0 && x.eta);
  const [matId, setMatId] = useState("dlc");
  const [E, setE] = useState(50);
  const [vol, setVol] = useState(10);
  const [area, setArea] = useState(1500);
  const [rough, setRough] = useState(1.0);
  const [etaOv, setEtaOv] = useState("");
  const [extra, setExtra] = useState(0);
  const [diffLoss, setDiffLoss] = useState(false);

  const m = usable.find(x => x.id === matId) || usable[0];
  const etaUsed = etaOv !== "" && Number.isFinite(parseFloat(etaOv)) ? parseFloat(etaOv) : m.eta;
  let results = null;

  if (E > 0 && E < m.Vf && vol > 0 && area > 0) {
    const eta = etaUsed * 1e-4;
    const v = Math.sqrt(2 * E * NEV / C.MN);
    const mu = muAvg(eta, E, m.Vf);
    const k = Math.sqrt(2 * C.MN * E * NEV) / C.HBAR;
    const pDiff = 1 - Math.exp(-4 * k * k * Math.pow(rough * 1e-9, 2) * (2 / 3));
    const muTot = mu + (diffLoss ? pDiff : 0);
    const V_m3 = vol * 1e-3, A_m2 = area * 1e-4;
    const mfp = 4 * V_m3 / A_m2;
    const rate = v / mfp;
    const tauWall = muTot > 0 ? 1 / (muTot * rate) : Infinity;
    const gExtra = Math.max(0, extra);
    const tau = 1 / (1 / tauWall + 1 / TAU_BETA + gExtra);
    results = [
      ["UCN speed v", `${v.toFixed(2)} m/s`],
      ["Loss per bounce μ̄ (isotropic average)", `${(mu * 1e4).toFixed(3)} × 10⁻⁴`],
      ["Diffuse-scattering probability (estimate)", `${(pDiff * 100).toFixed(2)} %${diffLoss ? " (counted as loss)" : " (not counted as loss)"}`],
      ["Mean free path 4V/A", `${(mfp * 100).toFixed(2)} cm`],
      ["Wall collision rate", `${rate.toFixed(1)} s⁻¹`],
      ["τ_wall (wall loss only)", isFinite(tauWall) ? `${tauWall.toFixed(0)} s` : "∞"],
      ["τ_β (neutron β-decay, PDG 2024)", `${TAU_BETA} s`],
      ["Extra loss rate (user input)", gExtra > 0 ? `${gExtra} s⁻¹` : "none"],
      ["Estimated storage lifetime τ", `${tau.toFixed(0)} s`, true],
    ];
  }

  return (
    <div>
      <div style={S.secLabel}>UCN storage lifetime estimator</div>
      <div style={S.infoBox}>
        <strong style={{ color: "#e8eaf0" }}>Model:</strong> 1/τ = 1/τ_wall + 1/τ_β + Γ_extra, with τ_wall = 1/(μ̄ · v · A / 4V). For an isotropic UCN flux, μ̄(E) = 2η [ (V_F/E)·asin√(E/V_F) − √(V_F/E − 1) ], which reduces to (4/3)·η·√(E/V_F) for E ≪ V_F (Golub &amp; Pendlebury 1979; Golub, Richardson &amp; Lamoreaux 1991).
      </div>
      <div style={S.calcGrid}>
        <Field label="Coating material">
          <select style={S.select} value={m.id} onChange={e => setMatId(e.target.value)}>
            {usable.map(x => <option key={x.id} value={x.id}>{x.name} ({x.formula})</option>)}
          </select>
        </Field>
        <Field label="UCN kinetic energy E (neV)"><input style={S.input} type="number" value={E} min={1} onChange={num(setE, 1)} /></Field>
        <Field label="Bottle volume (L)"><input style={S.input} type="number" value={vol} min={0.1} onChange={num(setVol, 10)} /></Field>
        <Field label="Bottle surface area (cm²)"><input style={S.input} type="number" value={area} min={10} onChange={num(setArea, 1500)} /></Field>
        <Field label="Surface roughness σ (nm, RMS)"><input style={S.input} type="number" value={rough} min={0} step={0.1} onChange={num(setRough, 0)} /></Field>
        <Field label={`η used (×10⁻⁴) — default ${fmtEta(m.eta)}${m.etaSrc === "abs" ? " (lower bound)" : ""}`}>
          <input style={S.input} type="number" step={0.1} placeholder={fmtEta(m.eta)} value={etaOv} onChange={e => setEtaOv(e.target.value)} />
        </Field>
        <Field label="Extra loss rate Γ_extra (s⁻¹, e.g. upscattering)"><input style={S.input} type="number" step={0.0001} min={0} value={extra} onChange={num(setExtra, 0)} /></Field>
        <Field label="Count diffuse scattering as loss?">
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#8892a4", fontFamily: mono, paddingTop: 6 }}>
            <input type="checkbox" checked={diffLoss} onChange={e => setDiffLoss(e.target.checked)} style={{ accentColor: "#00c896" }} />
            pessimistic (guide-transmission view)
          </label>
        </Field>
      </div>

      <div style={S.resultBox}>
        {!results ? (
          <div style={{ fontFamily: mono, fontSize: 13, color: "#e05252" }}>
            {E >= m.Vf ? "UCN energy ≥ V_F — no total reflection at normal incidence" : "Adjust inputs above"}
          </div>
        ) : results.map(([k, v, hi]) => <Row key={k} k={k} v={v} hi={hi} />)}
      </div>

      <div style={S.warnBox}>
        <strong style={{ color: "#e8eaf0" }}>Read before relying on this:</strong> (1) If η is marked as a lower bound, the lifetime is an <em>upper</em> estimate. (2) In a closed storage bottle, a diffusely scattered UCN is still stored, so diffuse scattering is shown separately and is off by default; switch it on to see a worst case for guides. (3) The diffuse probability uses a small-roughness estimate 1 − exp(−4k²σ²·⅔) and ignores the roughness correlation length (Steyerl 1972); treat it as an order-of-magnitude indicator. (4) Upscattering is <em>not</em> modelled; enter a Γ_extra from your own measurement or calculation. (5) Gravity and magnetic fields are in the Energy Shifts tab, not in this estimate.
      </div>
    </div>
  );
}

function CustomTab() {
  const [N, setN] = useState(6.0);
  const [bc, setBc] = useState(6.67);
  const [abs, setAbs] = useState(0.0);
  const [etaX, setEtaX] = useState(0);
  const [E, setE] = useState(50);

  const Vf = vfNeV(N, bc);
  const vc = Vf > 0 ? vcMs(Vf) : null;
  const etaA = Vf > 0 && abs > 0 ? etaAbs(bc, abs) : 0;
  const etaT = Vf > 0 ? etaA + Math.max(0, etaX) * 1e-4 : null;
  const mu = Vf > E && E > 0 && etaT != null ? muAvg(etaT, E, Vf) : null;

  return (
    <div>
      <div style={S.secLabel}>Custom material — Fermi potential calculator</div>
      <div style={S.formula}>
        V_F = (2πħ²/m_n) · N · b_c{"\n"}
        v_c = √(2·V_F / m_n){"\n"}
        η_abs = m_n · σ_abs · v₀ / (4π ħ b_c),  v₀ = 2200 m/s{"\n"}
        μ̄(E) = 2η [ (V_F/E)·asin√(E/V_F) − √(V_F/E − 1) ]
      </div>
      <div style={S.calcGrid}>
        <Field label="N — number density (×10²⁸ m⁻³)"><input style={S.input} type="number" value={N} step={0.1} onChange={num(setN)} /></Field>
        <Field label="b_c — coherent scattering length (fm)"><input style={S.input} type="number" value={bc} step={0.1} onChange={num(setBc)} /></Field>
        <Field label="σ_abs at 2200 m/s (barn)"><input style={S.input} type="number" value={abs} step={0.01} min={0} onChange={num(setAbs)} /></Field>
        <Field label="Additional η (×10⁻⁴; e.g. measured or hydrogen)"><input style={S.input} type="number" value={etaX} step={0.1} min={0} onChange={num(setEtaX)} /></Field>
        <Field label="UCN energy E (neV)"><input style={S.input} type="number" value={E} step={1} min={1} onChange={num(setE, 1)} /></Field>
      </div>
      <div style={S.resultBox}>
        <Row k="Fermi potential V_F" v={`${Vf.toFixed(1)} neV`} />
        <Row k="Critical velocity v_c" v={vc ? `${vc.toFixed(2)} m/s` : "N/A (V_F ≤ 0)"} />
        <Row k="η from absorption (lower bound)" v={Vf > 0 ? `${(etaA * 1e4).toFixed(3)} × 10⁻⁴` : "N/A"} />
        <Row k="η total (absorption + additional)" v={etaT != null ? `${(etaT * 1e4).toFixed(3)} × 10⁻⁴` : "N/A"} />
        <Row k="Loss per bounce μ̄ at E" v={mu != null ? `${(mu * 1e4).toFixed(3)} × 10⁻⁴` : (Vf > 0 && E >= Vf ? "E ≥ V_F — no reflection" : "N/A")} />
      </div>
      <div style={S.infoBox}>
        <strong style={{ color: "#e8eaf0" }}>η here</strong> includes only neutron absorption (1/v law, using the tabulated 2200 m/s cross-section) plus whatever additional η you enter. Incoherent-scattering upscattering and surface hydrogen are <em>not</em> computed, so use the additional-η field for measured values. For compounds, use mean-atom values: N = total atoms per volume, b_c and σ_abs averaged per atom. Tabulated b_c and σ_abs: Sears (1992), NIST NCNR.
      </div>
    </div>
  );
}

function CompareTab() {
  const [selected, setSelected] = useState(new Set(["dlc", "ni58", "nip", "be", "ni"]));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rows = MAT.filter(m => selected.has(m.id)).sort((a, b) => b.Vf - a.Vf);
  return (
    <div>
      <div style={S.secLabel}>Select materials to compare</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
        {MAT.map(m => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", fontFamily: mono, color: "#8892a4" }}>
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} style={{ accentColor: "#00c896" }} />
            {m.formula}
          </label>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={S.table}>
          <thead><tr>{["Material", "V_F (neV)", "v_c (m/s)", "η (×10⁻⁴)", "η basis", "N (×10²⁸)", "b_c (fm)", "V_F class"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.id} style={{ background: i === 0 && m.Vf > 0 ? "rgba(0,200,150,0.05)" : "transparent" }}>
                <td style={S.td}>{m.name}</td>
                <td style={{ ...S.td, color: i === 0 && m.Vf > 0 ? "#00c896" : "#e8eaf0" }}>{m.Vf.toFixed(0)}</td>
                <td style={S.td}>{m.vc ? m.vc.toFixed(2) : "—"}</td>
                <td style={S.td}>{etaLabel(m)}</td>
                <td style={S.td}>{m.etaSrc === "meas" ? "measured" : m.etaSrc === "pub" ? "published" : m.etaSrc === "abs" ? "abs. only" : "—"}</td>
                <td style={S.td}>{m.N ? m.N.toFixed(2) : "—"}</td>
                <td style={S.td}>{m.kind === "calc" ? m.bc : "—"}</td>
                <td style={S.td}><span style={S.tag(tagOf(m.Vf))}>{tagLabel(tagOf(m.Vf))}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={S.warnBox}>
        η values marked "abs. only" are lower bounds and should not be ranked against measured or published values. "V_F class" compares only V_F; real coating choice also depends on η, magnetism, toxicity, cost and how well the film can be deposited.
      </div>
    </div>
  );
}

function EnergyTab() {
  const [E, setE] = useState(120);
  const [h, setH] = useState(0.5);
  const [B, setB] = useState(1.0);
  const [spin, setSpin] = useState(1);
  const [matId, setMatId] = useState("nip");
  const m = MAT.find(x => x.id === matId);

  const Ug = (C.MN * C.G * h) / NEV;            // neV
  const Um = spin * MU_N * B;                    // neV; +: low-field seeker, −: high-field seeker
  const Ek = E - Ug - Um;
  const v = Ek > 0 ? Math.sqrt(2 * Ek * NEV / C.MN) : null;
  const margin = m.Vf - Ek;

  let verdict;
  if (Ek <= 0) verdict = "UCN cannot reach this height / field: kinetic energy would be ≤ 0.";
  else if (Ek >= m.Vf) verdict = `Kinetic energy at the wall (${Ek.toFixed(0)} neV) ≥ V_F: reflection is not guaranteed even at normal incidence.`;
  else verdict = `Reflected at all angles: ${margin.toFixed(0)} neV below V_F.`;

  return (
    <div>
      <div style={S.secLabel}>Energy bookkeeping — gravity and magnetic field</div>
      <div style={S.formula}>
        U_g = m_n·g·h ≈ 102.5 neV per metre{"\n"}
        U_M = ± μ_n·B, |μ_n| = 60.3 neV/T   (+ low-field seeker, − high-field seeker){"\n"}
        E_kin = E_total − U_g − U_M
      </div>
      <div style={S.calcGrid}>
        <Field label="Total UCN energy E (neV, at h = 0, B = 0)"><input style={S.input} type="number" value={E} step={5} onChange={num(setE)} /></Field>
        <Field label="Height h above reference (m)"><input style={S.input} type="number" value={h} step={0.1} onChange={num(setH)} /></Field>
        <Field label="Magnetic field B at the wall (T)"><input style={S.input} type="number" value={B} step={0.1} min={0} onChange={num(setB)} /></Field>
        <Field label="Spin state">
          <select style={S.select} value={spin} onChange={e => setSpin(parseInt(e.target.value, 10))}>
            <option value={1}>Low-field seeker (repelled by B)</option>
            <option value={-1}>High-field seeker (attracted to B)</option>
          </select>
        </Field>
        <Field label="Wall material">
          <select style={S.select} value={m.id} onChange={e => setMatId(e.target.value)}>
            {MAT.filter(x => x.Vf > 0).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={S.resultBox}>
        <Row k="Gravitational energy U_g" v={`${Ug.toFixed(1)} neV`} />
        <Row k="Magnetic energy U_M" v={`${Um.toFixed(1)} neV`} />
        <Row k="Kinetic energy at that point" v={`${Ek.toFixed(1)} neV`} />
        <Row k="Speed at that point" v={v ? `${v.toFixed(2)} m/s` : "—"} />
        <Row k={`Margin below V_F (${m.formula})`} v={`${margin.toFixed(0)} neV`} />
        <div style={{ ...S.resultRow, borderTop: "1px solid #2a3348", marginTop: 6, paddingTop: 8, fontFamily: mono, fontSize: 12, color: Ek <= 0 || Ek >= m.Vf ? "#e05252" : "#00c896" }}>{verdict}</div>
      </div>
      <div style={S.infoBox}>
        This is a point-wise energy budget, not a trajectory simulation, and it uses the normal-incidence criterion (E_kin &lt; V_F). It is not coupled to the lifetime estimator. For full tracking in gravitational and magnetic fields use a Monte Carlo code such as PENTrack (Schreyer et al., NIM A 858, 123, 2017). Constants (60.3 neV/T and 102.5 neV/m) follow Sidhu et al. (TUCAN), arXiv:2212.04958.
      </div>
    </div>
  );
}

function ModelTab() {
  const al = vfNeV(nFromRho(2.70, 26.9815), 3.449);
  const fe = vfNeV(nFromRho(7.874, 55.845), 9.45);
  const items = [
    { s: "ok", text: <><strong>Included:</strong> V_F = (2πħ²/m)·N·b_c from tabulated coherent scattering lengths and number densities. Critical velocity v_c. Absorption-only loss factor η_abs (1/v law). Measured or published η where a source was verified. Wall-loss probability per bounce averaged over an isotropic flux. Storage lifetime from wall loss + β-decay (τ_β = 878.4 s, PDG 2024) + an optional user-supplied extra loss rate. A first-order diffuse-scattering probability, shown separately.</> },
    { s: "part", text: <><strong>Partly included: Gravity and magnetic potential.</strong> The Energy Shifts tab does the energy budget (102.5 neV/m; ±60.3 neV/T, so 1 T gives ±60 neV) and compares it with V_F. It is not coupled into the lifetime estimate, and it is not a trajectory simulation.</> },
    { s: "no", text: <><strong>Not included: Upscattering.</strong> Incoherent scattering by hydrogen and thermal motion is not computed. The measured loss coefficient of DLC at room temperature is about twice its 70 K value, and this temperature-dependent part was interpreted as incoherent scattering by hydrogen (Atchison 2007). Use the extra-loss input with your own value.</> },
    { s: "no", text: <><strong>Not included: Surface roughness beyond a first-order estimate.</strong> Only RMS roughness σ is used; the correlation length and power spectrum are ignored (Steyerl 1972; Atchison 2010). TUCAN simulations use a measured Lambert diffuse-reflection probability of about 3% (room-temperature guides) to 15% (cryogenic region) instead (Sidhu 2022).</> },
    { s: "no", text: <><strong>Not included: Multilayer / supermirror effects.</strong> Ni/Ti depth-graded coatings need a depth-resolved reflectivity model. All coatings here are single homogeneous layers.</> },
    { s: "no", text: <><strong>Not included: Coating microstructure.</strong> DLC sp²/sp³ ratio, hydrogen content, density and stress change real V_F and η. The DLC entry assumes ρ ≈ 2.9 g/cm³; measure your own films (for example by XRR) and use the Custom tab.</> },
    { s: "no", text: <><strong>Not included: Non-specular angular redistribution.</strong> Diffusely scattered flux is not tracked inside the guide, so transmission along a guide is not modelled.</> },
    { s: "no", text: <><strong>Not included: Depolarisation and spin transport.</strong> Spin-flip probabilities per bounce are not modelled.</> },
  ];
  const mark = { ok: ["✓", "#00c896"], part: ["◐", "#4a9eff"], no: ["✗", "#f5a623"] };

  return (
    <div>
      <div style={S.secLabel}>Model assumptions &amp; known limitations</div>
      <div style={S.warnBox}>
        This tool uses the <strong style={{ color: "#e8eaf0" }}>optical-potential (Fermi pseudo-potential) approximation</strong>: a mean-field model that is standard but incomplete. It is meant for first-pass material screening, not for predicting a real experiment's performance.
      </div>
      <div style={{ margin: "1.25rem 0" }}>
        {items.map((item, i) => (
          <div key={i} style={{ ...S.assumItem, ...(i === items.length - 1 ? { borderBottom: "none" } : {}) }}>
            <span style={{ color: mark[item.s][1], fontFamily: mono, flexShrink: 0, marginTop: 1 }}>{mark[item.s][0]}</span>
            <span style={{ color: "#8892a4", fontSize: 13 }}>{item.text}</span>
          </div>
        ))}
      </div>

      <div style={S.infoBox}>
        <strong style={{ color: "#e8eaf0" }}>Self-check.</strong> With Sears (1992) b_c and handbook densities, the V_F formula gives Al = {al.toFixed(1)} neV and Fe = {fe.toFixed(1)} neV, compared with 54.1 and 209.1 neV used by the TUCAN collaboration (Sidhu et al. 2022). Computed values for other materials can differ by a few percent from textbook values because of the density and b_c used.
      </div>

      <div style={S.infoBox}>
        <strong style={{ color: "#e8eaf0" }}>References</strong>
        <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
          <li>R. Golub and J. M. Pendlebury, "Ultra-cold neutrons," Rep. Prog. Phys. 42, 439 (1979).</li>
          <li>R. Golub, D. Richardson and S. K. Lamoreaux, <em>Ultra-Cold Neutrons</em> (Adam Hilger, Bristol, 1991).</li>
          <li>V. K. Ignatovich, <em>The Physics of Ultracold Neutrons</em> (Clarendon Press, Oxford, 1990).</li>
          <li>A. Steyerl, "Effect of surface roughness on the total reflexion and transmission of slow neutrons," Z. Phys. 254, 169 (1972).</li>
          <li>F. Atchison et al., "First storage of ultracold neutrons using foils coated with diamond-like carbon," Phys. Lett. B 625, 19 (2005).</li>
          <li>F. Atchison et al., "Loss and spinflip probabilities for ultracold neutrons interacting with diamondlike carbon and beryllium surfaces," Phys. Rev. C 76, 044001 (2007).</li>
          <li>F. Atchison et al., "Diffuse reflection of ultracold neutrons from low-roughness surfaces," Eur. Phys. J. A 44 (2010), doi:10.1140/epja/i2010-10926-x.</li>
          <li>T. Brys et al., "Measurement of the loss and depolarization probability of UCN on beryllium and diamond like carbon films," J. Res. Natl. Inst. Stand. Technol. 110, 279 (2005).</li>
          <li>A. Serebrov et al., "Neutron lifetime measurements using gravitationally trapped ultracold neutrons," Phys. Rev. C 78, 035505 (2008).</li>
          <li>S. Sidhu et al. (TUCAN Collaboration), "Estimated performance of the TRIUMF ultracold neutron source and electric dipole moment apparatus," arXiv:2212.04958.</li>
          <li>W. Schreyer et al., "PENTrack," Nucl. Instrum. Methods A 858, 123 (2017).</li>
          <li>V. F. Sears, "Neutron scattering lengths and cross sections," Neutron News 3(3), 29 (1992); tables at NIST NCNR.</li>
          <li>S. Navas et al. (Particle Data Group), Phys. Rev. D 110, 030001 (2024): neutron mean life 878.4 ± 0.5 s.</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const TABS = ["Materials", "Storage Lifetime", "Custom Calc", "Compare", "Energy Shifts", "Model & Limits"];

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [selIdx, setSelIdx] = useState(0);

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.h1}>UCN Guide Material Analyzer</div>
        <div style={S.subhead}>// Fermi potential · storage lifetime · loss model · material comparison</div>
      </div>
      <div style={S.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} style={S.tab(i === activeTab)} onClick={() => setActiveTab(i)}>{t}</button>
        ))}
      </div>
      {activeTab === 0 && <MaterialsTab selIdx={selIdx} setSelIdx={setSelIdx} />}
      {activeTab === 1 && <LifetimeTab />}
      {activeTab === 2 && <CustomTab />}
      {activeTab === 3 && <CompareTab />}
      {activeTab === 4 && <EnergyTab />}
      {activeTab === 5 && <ModelTab />}
      <div style={{ marginTop: "2rem", paddingTop: "0.75rem", borderTop: "1px solid #2a3348", fontSize: 11, color: "#4a5568", fontFamily: mono }}>
        Screening tool for UCN coating selection. Data: Sears (1992), TUCAN (Sidhu 2022), Atchison (2007). See Model &amp; Limits for references and caveats.
      </div>
    </div>
  );
}
