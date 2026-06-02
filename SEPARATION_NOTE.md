# Nippon App — Stage 2 (Separated + Imports Fixed)

GlassTech ERP ka Nippon-only version. Glassco-specific UI nikaal di gayi aur saare
broken Glassco imports theek kar diye gaye. Structural check: 0 missing modules.
Shamil NAHI: node_modules, .git, dist/build.

## Chalane ka tareeqa
1. `npm install`
2. `npm run dev`   (ya `npm run build`)

## Stage 2 me kya hua
- Glassco-specific business UI (Quotation/Product Master, Production workbench,
  Projects, Vendor Hub) ko no-op stub bana diya — Nippon app me ye render nahi hote.
- SHARED files jo "glassco" naam se thin par poore app me use hoti hain, RESTORE ki gayin:
  glasscoGLService (GL/COGS posting), core/prints (GRN/QuotationPrint/SheetTag) + QrTag,
  GlasscoMRP, GlasscoLogistics, GlasscoCOA, GlasscoDataWiper, coa.glassco (data).

## Note
Kuch shared files me abhi bhi "glassco" naam hai (sirf cosmetic) — ye build/runtime
theek chalti hain. Aage chaaho to inhe rename kar ke fully Nippon-branded kar sakte ho.
