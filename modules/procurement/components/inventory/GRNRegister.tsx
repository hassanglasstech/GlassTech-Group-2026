/**
 * GRNRegister.tsx — GRN List / Register
 * Shows all GRNs for current company in list form with key details.
 * Derived from MaterialLedger entries (mvmntCode === '101').
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { MaterialLedgerEntry } from '@/modules/procurement/types/inventory';
import { Search, Truck, Trash2, ChevronDown, ChevronRight, Package } from 'lucide-react';

const GRNRegister: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGrn, setExpandedGrn] = useState<string | null>(null);

  // Build GRN list from ledger entries with mvmntCode 101
  const grnList = useMemo(() => {
    const ledger = InventoryService.getStockLedger()
      .filter((e: MaterialLedgerEntry) => e.company === company && e.mvmntCode === '101');

    // Group by referenceDoc (GRN ID)
    const grnMap: Record<string, {
      grnId: string;
      date: string;
      vendorName: string;
      vendorId: string;
      dcNo: string;
      biltyNo: string;
      poId: string;
      lines: MaterialLedgerEntry[];
      totalSqft: number;
      totalSheets: number;
      totalWeight: number;
      freightPKR: number;
      freightType: string;
    }> = {};

    ledger.forEach(e => {
      const grnId = e.referenceDoc;
      if (!grnId) return;
      if (!grnMap[grnId]) {
        grnMap[grnId] = {
          grnId,
          date: e.timestamp?.split('T')[0] || '',
          vendorName: e.vendorName || '',
          vendorId: e.vendorId || '',
          dcNo: e.dcNo || '',
          biltyNo: e.biltyNo || '',
          poId: e.poId || '',
          lines: [],
          totalSqft: 0,
          totalSheets: 0,
          totalWeight: 0,
          freightPKR: 0,
          freightType: e.freightType || '',
        };
      }
      grnMap[grnId].lines.push(e);
      grnMap[grnId].totalSqft += e.qty || 0;
      grnMap[grnId].totalSheets += e.sheetCount || 0;
      grnMap[grnId].totalWeight += e.lineWeightKg || 0;
      if (e.freightPKR) grnMap[grnId].freightPKR = e.freightPKR;
    });

    return Object.values(grnMap)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [company]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return grnList;
    const q = searchTerm.toLowerCase();
    return grnList.filter(g =>
      g.grnId.toLowerCase().includes(q) ||
      g.vendorName.toLowerCase().includes(q) ||
      g.dcNo.toLowerCase().includes(q) ||
      g.biltyNo.toLowerCase().includes(q)
    );
  }, [grnList, searchTerm]);

  // Sheet entries for expanded GRN
  const getSheetEntries = (grnId: string) =>
    InventoryService.getGRNSheetEntriesByGRN(grnId);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10"><Truck size={120}/></div>
        <div className="relative z-10">
          <h2 className="text-xl font-black uppercase tracking-tight">GRN Register</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {grnList.length} GRN(s) · {grnList.reduce((s, g) => s + g.totalSheets, 0)} sheets · {grnList.reduce((s, g) => s + g.totalSqft, 0).toFixed(0)} sqft
          </p>
        </div>
        <div className="relative w-72 z-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
          <input type="text" placeholder="Search GRN, vendor, DC, bilty…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-white placeholder-slate-400 outline-none focus:bg-white/20"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
        </div>
      </div>

      {/* GRN List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Column headers */}
        <div className="grid text-[9px] font-black uppercase text-slate-400 tracking-widest bg-slate-50 border-b px-6 py-3 gap-2"
          style={{ gridTemplateColumns: '24px 130px 90px 1fr 80px 80px 80px 90px 80px' }}>
          <span></span>
          <span>GRN ID</span>
          <span>Date</span>
          <span>Vendor</span>
          <span className="text-right">Sheets</span>
          <span className="text-right">SqFt</span>
          <span className="text-right">Weight KG</span>
          <span className="text-right">Freight</span>
          <span>DC / Bilty</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-300 font-bold uppercase italic text-sm">
            {grnList.length === 0 ? 'No GRNs posted yet' : 'No results matching search'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(grn => {
              const isExpanded = expandedGrn === grn.grnId;
              const sheets = isExpanded ? getSheetEntries(grn.grnId) : [];
              const defectCount = isExpanded ? sheets.filter(s => s.status !== 'OK').length : 0;

              return (
                <div key={grn.grnId}>
                  {/* GRN Row */}
                  <button
                    onClick={() => setExpandedGrn(isExpanded ? null : grn.grnId)}
                    className="w-full grid items-center px-6 py-3 gap-2 hover:bg-slate-50 transition-colors text-left"
                    style={{ gridTemplateColumns: '24px 130px 90px 1fr 80px 80px 80px 90px 80px' }}>
                    <span className="text-slate-400">
                      {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </span>
                    <span className="text-xs font-mono font-black text-blue-700">{grn.grnId}</span>
                    <span className="text-xs font-bold text-slate-500">{grn.date}</span>
                    <span className="text-xs font-bold text-slate-700 uppercase truncate">{grn.vendorName || '—'}</span>
                    <span className="text-xs font-black text-slate-800 text-right">{grn.totalSheets}</span>
                    <span className="text-xs font-black text-emerald-600 text-right">{grn.totalSqft.toFixed(1)}</span>
                    <span className="text-xs font-bold text-slate-500 text-right">{grn.totalWeight.toFixed(1)}</span>
                    <span className="text-xs font-bold text-blue-600 text-right">
                      {grn.freightPKR > 0 ? `PKR ${grn.freightPKR.toLocaleString()}` : '—'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 truncate">
                      {grn.dcNo || '—'} / {grn.biltyNo || '—'}
                    </span>
                  </button>

                  {/* Expanded: Line items + sheet entries */}
                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 px-10 py-4">
                      {/* Line items */}
                      <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">
                        {grn.lines.length} Line Item(s)
                        {grn.poId && <span className="ml-3 text-blue-500">PO: {grn.poId}</span>}
                      </div>
                      <div className="space-y-1 mb-4">
                        {grn.lines.map((line, i) => (
                          <div key={line.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-[10px] font-bold">
                            <span className="text-slate-400">#{i + 1}</span>
                            <span className="text-slate-700 uppercase flex-1 ml-2 truncate">{line.remarks?.replace(`GRN ${grn.grnId} — `, '') || line.materialId}</span>
                            <span className="text-slate-500 mx-3">{line.sheetCount || 0} sheets</span>
                            <span className="text-emerald-600 font-black">{(line.qty || 0).toFixed(1)} sqft</span>
                            <span className="text-slate-400 ml-3">@ {(line.valuation || 0).toFixed(0)}/sqft</span>
                          </div>
                        ))}
                      </div>

                      {/* Sheet entries summary */}
                      {sheets.length > 0 && (
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-1 tracking-widest">
                          {sheets.length} Sheet Tags — {sheets.filter(s => s.status === 'OK').length} OK
                          {defectCount > 0 && <span className="text-amber-600 ml-2">{defectCount} Defect(s)</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GRNRegister;
