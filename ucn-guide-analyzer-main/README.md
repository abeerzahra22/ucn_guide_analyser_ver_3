# UCN Guide Material Analyzer

A screening tool for choosing ultracold-neutron (UCN) guide and storage coatings. It computes the Fermi potential V_F, critical velocity v_c and loss factor η for common materials, compares coatings, estimates a storage lifetime, and does a simple gravity/magnetic energy budget.

Live: https://ucn-guide-analyzer.vercel.app

**Authorship.** Concept, scope, physics choices and review: Abeer Zahra. Implementation was developed with AI assistance (Claude, Anthropic).

## Run locally
```
npm install
npm run dev
```

## What it is (and is not)
Optical-potential (Fermi pseudo-potential) model for first-pass material screening. It is not a trajectory simulation; for that use a Monte Carlo code such as PENTrack. See the *Model & Limits* tab for the full list of what is and is not modelled, and for references.

## Data provenance
- V_F = (2πħ²/m)·N·b_c, computed from Sears (1992) coherent scattering lengths (NIST NCNR tables) and handbook densities. Check: reproduces Al 54.1 neV and Fe 208.9 neV (TUCAN uses 54.1 and 209.1).
- η_abs = m·σ_abs·v₀/(4πħ·b_c) is a **lower bound** (absorption only). Where a measurement was verified (DLC, Be: Atchison 2007), that value is used instead.
- NiP and dPS use published TUCAN simulation inputs (Sidhu et al., arXiv:2212.04958).
- τ_β = 878.4 s (PDG 2024).
- Assumed (not sourced): DLC ρ ≈ 2.9 g/cm³ (chosen to match v_c ≈ 7 m/s); Fomblin ρ = 1.9 g/cm³.

## Audit log (October 2026)
- Fixed: wrong Golub & Pendlebury citation (now Rep. Prog. Phys. 42, 439, 1979); Atchison PRC paper year/volume (PRC 76, 044001, 2007) and added PLB 625, 19 (2005); Serebrov 2008 description.
- Fixed: neutron lifetime 879.4 s (PDG 2019/2020) → 878.4 s (PDG 2024).
- Fixed: hard-coded V_F / v_c values that did not follow from N and b_c (e.g. DLC, Cr, Fomblin, v_c); Cu b_c 7.49 → 7.718 fm; Ti b_c −3.37 → −3.438 fm; Cr V_F 180 → 79 neV (from N·b_c).
- Fixed: Custom-tab η had a dimensional error (ħ²/2m used where ħ/2 is needed) and an unused velocity correction.
- Fixed: loss per bounce now averaged over an isotropic flux instead of normal incidence only.
- Removed: unsourced fudge factors (roughness 0.05 prefactor, temperature-scaled upscattering 10⁻⁴ s⁻¹), unsourced "2–5×" roughness claim, "ALARA" used for beryllium toxicity, "highest known V_F" claim for diamond.
- Added: NiP and dPS (TUCAN inputs), Energy Shifts tab (gravity, magnetic), η provenance labels, self-check, references.
