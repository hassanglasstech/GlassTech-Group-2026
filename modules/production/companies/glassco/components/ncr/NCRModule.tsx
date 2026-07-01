/**
 * NCRModule.tsx — Design System v2
 *
 * UI Changes (business logic untouched):
 *  - Replaced rose-50 bar header → CompactPageHeader with Alt+R refresh
 *  - NCR Register table → DataGridCard (py-1.5 px-3 high-density)
 *  - Vendor Claims table → DataGridCard
 *  - Eradicated old rounded-2xl bloated KPI cards → compact grid
 *  - min-h-0 flex-1 scroll pattern for tablet/factory screens
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { NCRService } from '@/modules/production/services/ncrService';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import NCRDefectPrint from '@/modules/glassco/core/prints/NCRDefectPrint';
import { toast } from 'sonner';
import {
  AlertTriangle, Plus, X, CheckCircle2, Clock, RefreshCw,
  FileText, TrendingDown, Package, ChevronRight, Banknote,
  BarChart3, Eye, Send, ShieldCheck, Trash2, Printer, FileSpreadsheet
} from 'lucide-react';
import { exportNCRRegister } from '@/modules/production/services/productionExporter';   // Phase-6 (6.7)
import type { NCREvent, NCRStage, NCRCause, NCRAction, NCRReproduction, NCRVendorClaim } from '@/modules/production/types/ncr';
import { NCR_CAUSE_LABELS, NCR_STAGE_LABELS } from '@/modules/production/types/ncr';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';
import { EmptyState } from '@/modules/shared/components/EmptyState';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ──────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : n.toLocaleString();
const statusColor: Record<string, string> = {
  'Open':               'bg-amber-100 text-amber-700',
  'Reproduce-Pending':  'bg-blue-100 text-blue-700',
  'Reproduce-InProgress': 'bg-indigo-100 text-indigo-700',
  'Reproduce-Done':     'bg-emerald-100 text-emerald-700',
  'Claim-Pending':      'bg-orange-100 text-orange-700',
  'Claim-Settled':      'bg-emerald-100 text-emerald-700',
  'Closed':             'bg-slate-100 text-slate-500',
};
const actionColor: Record<string, string> = {
  'Dispose':      'bg-rose-100 text-rose-700',
  'Reproduce':    'bg-blue-100 text-blue-700',
  'Vendor-Claim': 'bg-amber-100 text-amber-700',
};

// ── NCR Form ─────────────────────────────────────────────────────────
const NCRForm: React.FC<{
  company: string;
  pieces: any[];
  jobOrders: any[];
  vendors: any[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ company, pieces, jobOrders, vendors, onClose, onSaved }) => {
  const [form, setForm] = useState({
    pieceId: '',
    jobOrderId: '',
    itemIndex: 0,
    stage: 'Cutting' as NCRStage,
    cause: 'BR-01-Operator-Error' as NCRCause,
    description: '',
    reportedBy: '',
    sqftLost: 0,
    glassType: '',
    thickness: '',
    estimatedValue: 0,
    action: 'Dispose' as NCRAction,
    vendorId: '',
    vendorName: '',
    purchaseRef: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  // Auto-fill from piece
  const selectedPiece = pieces.find(p => p.id === form.pieceId);
  const selectedJob = jobOrders.find(j => j.orderNo === form.jobOrderId || j.id === form.jobOrderId);

  const handlePieceSelect = (pieceId: string) => {
    const p = pieces.find(x => x.id === pieceId);
    if (!p) { setForm(f => ({ ...f, pieceId })); return; }
    const job = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
    const item = job?.items?.[p.itemIndex];
    setForm(f => ({
      ...f,
      pieceId,
      jobOrderId: p.orderId || '',
      itemIndex: p.itemIndex ?? 0,
      glassType: item?.glassType || p.specs || '',
      sqftLost: item?.totalSqFt || 0,
    }));
  };

  const handleSubmit = () => {
    if (!form.stage || !form.cause || !form.description.trim()) {
      toast.error('Stage, cause, and description required.'); return;
    }
    if (!form.reportedBy.trim()) {
      toast.error('Reported by is required.'); return;
    }
    if (form.action === 'Vendor-Claim' && !form.vendorId) {
      toast.error('Select vendor for claim.'); return;
    }
    setBusy(true);
    try {
      NCRService.createNCR({
        company,
        pieceId: form.pieceId || undefined,
        jobOrderId: form.jobOrderId || undefined,
        itemIndex: form.itemIndex,
        stage: form.stage,
        cause: form.cause,
        description: form.description,
        reportedBy: form.reportedBy,
        sqftLost: Number(form.sqftLost) || 0,
        glassType: form.glassType,
        thickness: form.thickness,
        estimatedValue: Number(form.estimatedValue) || 0,
        action: form.action,
        vendorId: form.vendorId || undefined,
        vendorName: form.vendorName || undefined,
        purchaseRef: form.purchaseRef || undefined,
        notes: form.notes || undefined,
      });
      toast.success('NCR created successfully.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to create NCR.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-modal flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-card shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-rose-600 text-white p-5 rounded-t-card flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black uppercase">New NCR — Breakage Report</h2>
            <p className="text-xs text-rose-200 mt-0.5">Non-Conformance Report — Glass Breakage</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Piece / Job Link */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Link to Piece / Job (Optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-bold text-slate-400 uppercase">Piece ID</label>
                <input
                  className="sap-input w-full mt-1"
                  placeholder="e.g. 2428/3"
                  value={form.pieceId}
                  onChange={e => handlePieceSelect(e.target.value)}
                  list="piece-list"
                />
                <datalist id="piece-list">
                  {pieces.filter(p => p.status !== 'Broken' && p.status !== 'Delivered').map(p => (
                    <option key={p.id} value={p.id}>{p.id} — {p.specs}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-2xs font-bold text-slate-400 uppercase">Job Order</label>
                <input
                  className="sap-input w-full mt-1"
                  placeholder="e.g. QT-2428"
                  value={form.jobOrderId}
                  onChange={e => setForm(f => ({ ...f, jobOrderId: e.target.value }))}
                />
              </div>
            </div>
            {selectedPiece && (
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 text-xs font-bold text-rose-700">
                ⚠️ Piece {selectedPiece.id} will be marked as <strong>BROKEN</strong>
              </div>
            )}
          </div>

          {/* Stage & Cause */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Breakage Stage *</label>
              <select
                className="sap-input w-full mt-1"
                value={form.stage}
                onChange={e => setForm(f => ({ ...f, stage: e.target.value as NCRStage }))}
              >
                {Object.entries(NCR_STAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Root Cause *</label>
              <select
                className="sap-input w-full mt-1"
                value={form.cause}
                onChange={e => setForm(f => ({ ...f, cause: e.target.value as NCRCause }))}
              >
                {Object.entries(NCR_CAUSE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-black text-slate-600 uppercase">Description *</label>
            <textarea
              className="sap-input w-full mt-1 resize-none"
              rows={2}
              placeholder="What happened exactly..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Loss Details */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Sq.Ft Lost</label>
              <input
                type="number" min="0" step="0.01"
                className="sap-input w-full mt-1"
                value={form.sqftLost || ''}
                onChange={e => setForm(f => ({ ...f, sqftLost: +e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Glass Type</label>
              <input
                className="sap-input w-full mt-1"
                placeholder="e.g. 8mm Tempered"
                value={form.glassType}
                onChange={e => setForm(f => ({ ...f, glassType: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Est. Value (PKR)</label>
              <input
                type="number" min="0"
                className="sap-input w-full mt-1"
                value={form.estimatedValue || ''}
                onChange={e => setForm(f => ({ ...f, estimatedValue: +e.target.value }))}
              />
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="text-xs font-black text-slate-600 uppercase mb-2 block">Action *</label>
            <div className="grid grid-cols-3 gap-3">
              {(['Dispose', 'Reproduce', 'Vendor-Claim'] as NCRAction[]).map(action => (
                <button
                  key={action}
                  onClick={() => setForm(f => ({ ...f, action }))}
                  className={`p-3 rounded-xl border-2 text-xs font-black uppercase text-center transition-all ${
                    form.action === action
                      ? action === 'Dispose' ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : action === 'Reproduce' ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {action === 'Dispose' ? '🗑️ Dispose' : action === 'Reproduce' ? '🔄 Reproduce' : '📋 Vendor Claim'}
                  <p className="text-2xs font-bold mt-1 normal-case">
                    {action === 'Dispose' ? 'Write-off + scrap' : action === 'Reproduce' ? 'Make new piece' : 'Claim from vendor'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Vendor Claim details */}
          {form.action === 'Vendor-Claim' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-black text-amber-700 uppercase">Vendor Claim Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-bold text-slate-400 uppercase">Vendor *</label>
                  <select
                    className="sap-input w-full mt-1"
                    value={form.vendorId}
                    onChange={e => {
                      const v = vendors.find(x => x.id === e.target.value);
                      setForm(f => ({ ...f, vendorId: e.target.value, vendorName: v?.name || '' }));
                    }}
                  >
                    <option value="">-- Select Vendor --</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs font-bold text-slate-400 uppercase">Purchase Ref / GRN</label>
                  <input
                    className="sap-input w-full mt-1"
                    placeholder="PO or GRN number"
                    value={form.purchaseRef}
                    onChange={e => setForm(f => ({ ...f, purchaseRef: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-2xs text-amber-600 font-bold">
                ℹ️ Claim will be created in Draft status. Submit with photos for vendor.
              </p>
            </div>
          )}

          {/* Reporter */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Reported By *</label>
              <input
                className="sap-input w-full mt-1"
                placeholder="Supervisor / Operator name"
                value={form.reportedBy}
                onChange={e => setForm(f => ({ ...f, reportedBy: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase">Notes</label>
              <input
                className="sap-input w-full mt-1"
                placeholder="Additional notes..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="sap-btn-ghost">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="sap-btn-primary flex items-center gap-2"
          >
            <AlertTriangle size={14}/>
            {busy ? 'Saving...' : 'Create NCR'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── NCR Detail Modal ──────────────────────────────────────────────────
const NCRDetail: React.FC<{
  ncr: NCREvent;
  reproductions: NCRReproduction[];
  claims: NCRVendorClaim[];
  onClose: () => void;
  onRefresh: () => void;
  company: string;
}> = ({ ncr, reproductions, claims, onClose, onRefresh, company }) => {
  const navigate = useNavigate();
  const ncrReprs = reproductions.filter(r => r.ncrId === ncr.id);
  const ncrClaim = claims.find(c => c.ncrId === ncr.id);
  const [showPrint, setShowPrint] = useState(false);

  // Find matching VendorDefectReport for this NCR (via vendor claim)
  const matchingVDR = useMemo(() => {
    if (ncr.action !== 'Vendor-Claim' || !ncr.vendorName) return undefined;
    const allReports = InventoryService.getVendorDefectReports();
    // Match by company + vendor name + closest date
    return allReports.find((r: any) => r.company === company && r.vendorName === ncr.vendorName);
  }, [ncr, company]);

  const handleSubmitClaim = () => {
    if (!ncrClaim) return;
    NCRService.submitClaim(ncrClaim.id);
    toast.success('Claim submitted to vendor.');
    onRefresh();
  };

  const handleClose = () => {
    NCRService.closeNCR(ncr.id, 'System');
    toast.success('NCR closed.');
    onRefresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-modal flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-card shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white p-5 rounded-t-card flex items-center justify-between">
          <div>
            <h2 className="text-base font-black uppercase">{ncr.id}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{new Date(ncr.reportedAt).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status + Action */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${statusColor[ncr.status]}`}>{ncr.status}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${actionColor[ncr.action]}`}>{ncr.action}</span>
            {ncr.pieceId && <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-slate-100 text-slate-600">Piece: {ncr.pieceId}</span>}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs font-black text-slate-400 uppercase">Stage</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{NCR_STAGE_LABELS[ncr.stage]}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs font-black text-slate-400 uppercase">Root Cause</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{NCR_CAUSE_LABELS[ncr.cause]}</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-3">
              <p className="text-2xs font-black text-rose-400 uppercase">Sq.Ft Lost</p>
              <p className="text-xl font-black text-rose-700 mt-0.5">{ncr.sqftLost} ft²</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-3">
              <p className="text-2xs font-black text-rose-400 uppercase">Estimated Loss</p>
              <p className="text-xl font-black text-rose-700 mt-0.5">PKR {ncr.estimatedValue.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xs font-black text-slate-400 uppercase mb-1">Description</p>
            <p className="text-sm text-slate-700">{ncr.description}</p>
            {ncr.notes && <p className="text-xs text-slate-500 mt-1">Note: {ncr.notes}</p>}
          </div>

          {/* GL Entry */}
          {ncr.glEntryId && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0"/>
              <p className="text-xs font-bold text-emerald-700">GL Write-off posted: <span className="font-black">{ncr.glEntryId}</span></p>
            </div>
          )}

          {/* Reproductions */}
          {ncrReprs.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-2">Reproduction Orders</p>
              {ncrReprs.map(r => (
                <div key={r.id} className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-blue-700">{r.id}</p>
                    <p className="text-2xs text-blue-500 mt-0.5">Priority: {r.priority} · Status: {r.status}</p>
                    {r.newPieceId && <p className="text-2xs text-emerald-600 mt-0.5">✓ New piece: {r.newPieceId}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${
                    r.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                    r.status === 'Queued' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Vendor Claim */}
          {ncrClaim && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-2">Vendor Claim</p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-amber-700">{ncrClaim.id} — {ncrClaim.vendorName}</p>
                  <span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${
                    ncrClaim.status === 'Settled' ? 'bg-emerald-100 text-emerald-700' :
                    ncrClaim.status === 'Submitted' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{ncrClaim.status}</span>
                </div>
                <p className="text-sm font-black text-amber-800">PKR {ncrClaim.claimAmount.toLocaleString()}</p>
                {ncrClaim.settledAmount && (
                  <p className="text-xs text-emerald-600 font-bold mt-1">
                    Settled: PKR {ncrClaim.settledAmount.toLocaleString()}
                  </p>
                )}
                {ncrClaim.status === 'Draft' && (
                  <button onClick={handleSubmitClaim} className="mt-2 flex items-center gap-1 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-black">
                    <Send size={12}/> Submit to Vendor
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Create Replacement Order — post-dispatch breakage only */}
          {['Site', 'Loading', 'Tempering-Transit'].includes(ncr.stage) && ncr.status !== 'Closed' && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-2xs font-black text-orange-500 uppercase mb-1">Post-Delivery Breakage</p>
              <p className="text-xs text-orange-700 mb-2">Customer breakage after dispatch — create a replacement quotation linked to original order.</p>
              <button
                onClick={() => {
                  localStorage.setItem('glassco_replacement_prefill', JSON.stringify({
                    orderType: 'Replacement',
                    originalOrderRef: ncr.jobOrderId || '',
                    replacementReason: 'Customer Breakage',
                    costBearer: 'Customer',
                    projectName: `REPLACEMENT — ${ncr.id}`,
                  }));
                  navigate('/sales');
                  onClose();
                }}
                className="flex items-center gap-1 bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-black hover:bg-orange-700"
              >
                <Plus size={14}/> Create Replacement Order
              </button>
            </div>
          )}

          {/* Actions */}
          {ncr.status !== 'Closed' && (
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowPrint(true)} className="flex items-center gap-1 bg-red-50 text-red-700 px-4 py-2 rounded-lg text-xs font-black hover:bg-red-100">
                <Printer size={14}/> Print NCR
              </button>
              <button onClick={handleClose} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-xs font-black hover:bg-slate-200">
                <CheckCircle2 size={14}/> Close NCR
              </button>
            </div>
          )}
          {ncr.status === 'Closed' && (
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowPrint(true)} className="flex items-center gap-1 bg-red-50 text-red-700 px-4 py-2 rounded-lg text-xs font-black hover:bg-red-100">
                <Printer size={14}/> Print NCR
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NCR Print Overlay */}
      {showPrint && (
        <div className="fixed inset-0 z-popover bg-white overflow-y-auto">
          <NCRDefectPrint
            ncr={{
              id: ncr.id,
              company,
              stage: NCR_STAGE_LABELS[ncr.stage] || ncr.stage,
              cause: NCR_CAUSE_LABELS[ncr.cause] || ncr.cause,
              description: ncr.description,
              reportedBy: ncr.reportedBy,
              reportedAt: ncr.reportedAt,
              glassType: ncr.glassType,
              thickness: ncr.thickness,
              sqftLost: ncr.sqftLost,
              estimatedValue: ncr.estimatedValue,
              action: ncr.action,
              vendorName: ncr.vendorName,
              purchaseRef: ncr.purchaseRef,
              notes: ncr.notes,
              status: ncr.status,
            }}
            defectReport={matchingVDR}
            mode={matchingVDR ? 'Both' : 'NCR'}
            onClose={() => setShowPrint(false)}
          />
        </div>
      )}
    </div>
  );
};

// ── Main NCR Module ───────────────────────────────────────────────────
const NCRModule: React.FC = () => {
  const { pieces, jobOrders, company } = useProductionContext();
  const [activeTab, setActiveTab] = useState<'list' | 'kpi' | 'reproductions' | 'claims'>('list');
  const [showForm, setShowForm] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<NCREvent | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  const vendors = SalesService.getVendors().filter(v => v.company === company);

  // ── Wire Alt+R global shortcut ────────────────────────────────────
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, []);

  const ncrs = useMemo(() =>
    NCRService.getNCRByCompany(company)
      .filter(e => filterMonth ? e.reportedAt.startsWith(filterMonth) : true)
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    [company, filterMonth, tick]
  );

  const reproductions = useMemo(() =>
    NCRService.getReproductionsByCompany(company), [company, tick]);

  const claims = useMemo(() =>
    NCRService.getVendorClaimsByCompany(company), [company, tick]);

  const kpis = useMemo(() =>
    NCRService.getKPIs(company, filterMonth || undefined), [company, filterMonth, tick]);

  // Month options
  const now = new Date();
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    };
  });

  // ── NCR Register columns for DataGridCard ─────────────────────────
  const ncrColumns: GridColumn[] = [
    { key: 'id', header: 'NCR ID', width: '10%' },
    { key: 'stage', header: 'Stage' },
    { key: 'cause', header: 'Cause' },
    { key: 'piece', header: 'Piece' },
    { key: 'sqft', header: 'Sqft', align: 'right' },
    { key: 'loss', header: 'Loss (PKR)', align: 'right' },
    { key: 'action', header: 'Action' },
    { key: 'status', header: 'Status' },
    { key: 'date', header: 'Date' },
    { key: 'view', header: '', width: '3%' },
  ];

  // ── Vendor Claims columns for DataGridCard ────────────────────────
  const claimColumns: GridColumn[] = [
    { key: 'id', header: 'Claim ID' },
    { key: 'ncrRef', header: 'NCR Ref' },
    { key: 'vendor', header: 'Vendor' },
    { key: 'claimAmt', header: 'Claim Amt', align: 'right' },
    { key: 'settled', header: 'Settled', align: 'right' },
    { key: 'status', header: 'Status' },
    { key: 'date', header: 'Date' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <CompactPageHeader
        title="NCR — Breakage Control"
        subtitle="Non-Conformance"
        breadcrumbs={[{ label: 'Production' }, { label: 'NCR' }]}
        actions={[
          {
            label: 'New NCR',
            icon: <Plus size={12} />,
            onClick: () => setShowForm(true),
            variant: 'danger',
          },
          {
            // Phase-6 (6.7) — Excel export of the visible NCR register
            label: 'Export Excel',
            icon: <FileSpreadsheet size={12} />,
            onClick: () => {
              try { exportNCRRegister(ncrs as any[]); toast.success(`Exported ${ncrs.length} NCR(s).`); }
              catch (e: any) { toast.error(e?.message || 'Export failed.'); }
            },
            variant: 'secondary',
          },
          {
            label: 'Refresh',
            icon: <RefreshCw size={12} />,
            onClick: () => window.dispatchEvent(new CustomEvent('erp:refresh')),
            variant: 'secondary',
            shortcut: 'Alt+R',
          },
        ]}
        meta={
          <div className="flex items-center gap-2">
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="text-2xs border border-slate-200 rounded px-2 py-1.5 text-slate-600 font-bold bg-white focus:outline-none"
            >
              <option value="">All Time</option>
              {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span className="text-2xs font-black text-rose-500 uppercase">{ncrs.length} NCRs</span>
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4">
      {/* KPI Cards — compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-2xs font-black text-slate-400 uppercase tracking-wider">Total Breakages</p>
          <p className="text-xl font-black text-rose-600 mt-0.5">{kpis.totalBroken}</p>
          <p className="text-2xs text-slate-400">{kpis.totalSqftLost} ft² lost</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-2xs font-black text-slate-400 uppercase tracking-wider">Breakage Rate</p>
          <p className={`text-xl font-black mt-0.5 ${kpis.breakageRate > 3 ? 'text-rose-600' : kpis.breakageRate > 1.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {kpis.breakageRate}%
          </p>
          <p className="text-2xs text-slate-400">{kpis.breakageRate > 2 ? 'Above target' : 'Within target'}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-2xs font-black text-slate-400 uppercase tracking-wider">Total Loss</p>
          <p className="text-xl font-black text-rose-700 mt-0.5">PKR {fmt(kpis.totalLoss)}</p>
          <p className="text-2xs text-slate-400">{kpis.reproduced} reproduced</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-2xs font-black text-slate-400 uppercase tracking-wider">Claim Recovery</p>
          <p className="text-xl font-black text-emerald-600 mt-0.5">{kpis.recoveryRate}%</p>
          <p className="text-2xs text-slate-400">PKR {fmt(kpis.totalRecovered)} recovered</p>
        </div>
      </div>

      {/* Tabs — compact */}
      <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-slate-200 w-fit shrink-0 overflow-x-auto">
        {[
          { id: 'list', label: 'NCR Register', icon: FileText },
          { id: 'reproductions', label: 'Reproduce Queue', icon: RefreshCw },
          { id: 'claims', label: 'Vendor Claims', icon: Banknote },
          { id: 'kpi', label: 'Analytics', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-2xs font-bold uppercase whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-rose-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={12}/>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── NCR List ── */}
      {activeTab === 'list' && (
        <DataGridCard
          columns={ncrColumns}
          className="flex-1"
          emptyState={
            <span className="text-xs text-slate-300 font-black uppercase italic">
              No NCRs recorded{filterMonth ? ' this period' : ''}.
            </span>
          }
        >
          {ncrs.map((ncr, ri) => (
            <tr
              key={ncr.id}
              onClick={() => setSelectedNCR(ncr)}
              className={[
                'border-b border-slate-100 last:border-0 cursor-pointer',
                ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                'hover:bg-rose-50/40 transition-colors',
              ].join(' ')}
            >
              <td className="py-1.5 px-3 font-black text-rose-600">{ncr.id}</td>
              <td className="py-1.5 px-3 text-slate-700">{ncr.stage}</td>
              <td className="py-1.5 px-3 text-slate-700">{ncr.cause.split('-').slice(0,2).join('-')}</td>
              <td className="py-1.5 px-3 font-bold text-blue-600">{ncr.pieceId || '—'}</td>
              <td className="py-1.5 px-3 text-right font-bold text-slate-700">{ncr.sqftLost}</td>
              <td className="py-1.5 px-3 text-right font-black text-rose-600">{ncr.estimatedValue.toLocaleString()}</td>
              <td className="py-1.5 px-3"><span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${actionColor[ncr.action]}`}>{ncr.action}</span></td>
              <td className="py-1.5 px-3"><span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${statusColor[ncr.status]}`}>{ncr.status}</span></td>
              <td className="py-1.5 px-3 text-slate-400">{ncr.reportedAt.split('T')[0]}</td>
              <td className="py-1.5 px-3"><Eye size={12} className="text-slate-300"/></td>
            </tr>
          ))}
        </DataGridCard>
      )}

      {/* ── Reproduction Queue ── */}
      {activeTab === 'reproductions' && (
        <div className="space-y-3 flex-1 min-h-0">
          {['Queued', 'In-Production'].map(status => {
            const items = reproductions.filter(r => r.status === status);
            if (items.length === 0) return null;
            return (
              <div key={status} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 border-b border-blue-100 flex items-center gap-2">
                  <RefreshCw size={12} className="text-blue-600"/>
                  <h3 className="text-2xs font-black text-blue-700 uppercase">{status} ({items.length})</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map(r => {
                    const job = jobOrders.find(j => j.orderNo === r.jobOrderId || j.id === r.jobOrderId);
                    return (
                      <div key={r.id} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-blue-600">{r.id}</p>
                          <p className="text-2xs text-slate-500 mt-0.5">
                            NCR: {r.ncrId} · Job: {r.jobOrderId} · {job?.projectName || ''}
                          </p>
                          {r.originalPieceId && <p className="text-2xs text-slate-400">Original: {r.originalPieceId}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${
                            r.priority === 'Urgent' ? 'bg-rose-100 text-rose-700' :
                            r.priority === 'High' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>{r.priority}</span>
                          <p className="text-2xs text-slate-400">{r.createdAt.split('T')[0]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {reproductions.filter(r => r.status === 'Queued' || r.status === 'In-Production').length === 0 && (
            <EmptyState
              compact
              icon={<RefreshCw size={22} />}
              title="No pending reproductions"
              description="Reproduction orders raised from NCRs will queue here."
            />
          )}
        </div>
      )}

      {/* ── Vendor Claims ── */}
      {activeTab === 'claims' && (
        <DataGridCard
          columns={claimColumns}
          className="flex-1"
          emptyState={<span className="text-xs text-slate-300 font-black uppercase italic">No vendor claims yet.</span>}
        >
          {claims.map((c, ri) => (
            <tr key={c.id} className={[
              'border-b border-slate-100 last:border-0',
              ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
              'hover:bg-slate-50/70 transition-colors',
            ].join(' ')}>
              <td className="py-1.5 px-3 font-black text-amber-600">{c.id}</td>
              <td className="py-1.5 px-3 font-bold text-rose-600">{c.ncrId}</td>
              <td className="py-1.5 px-3 font-bold text-slate-700">{c.vendorName}</td>
              <td className="py-1.5 px-3 text-right font-black text-slate-700">PKR {c.claimAmount.toLocaleString()}</td>
              <td className="py-1.5 px-3 text-right font-bold text-emerald-600">
                {c.settledAmount ? `PKR ${c.settledAmount.toLocaleString()}` : '—'}
              </td>
              <td className="py-1.5 px-3">
                <span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${
                  c.status === 'Settled' ? 'bg-emerald-100 text-emerald-700' :
                  c.status === 'Submitted' ? 'bg-blue-100 text-blue-700' :
                  c.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{c.status}</span>
              </td>
              <td className="py-1.5 px-3 text-slate-400">{c.claimDate}</td>
            </tr>
          ))}
        </DataGridCard>
      )}

      {/* ── Analytics ── */}
      {activeTab === 'kpi' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-h-0">
          {/* By Stage */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-2xs font-black text-slate-500 uppercase mb-3">Breakage by Stage</h3>
            {Object.entries(kpis.byStage).sort((a,b) => b[1]-a[1]).map(([stage, count]) => (
              <div key={stage} className="flex items-center gap-3 mb-1.5">
                <span className="text-2xs font-bold text-slate-600 w-28 truncate">{stage}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${(count / kpis.totalBroken) * 100}%` }} />
                </div>
                <span className="text-2xs font-black text-slate-700 w-6 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(kpis.byStage).length === 0 && <p className="text-xs text-slate-300 text-center py-4">No data</p>}
          </div>

          {/* By Cause */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-2xs font-black text-slate-500 uppercase mb-3">Breakage by Cause</h3>
            {Object.entries(kpis.byCause).sort((a,b) => b[1]-a[1]).map(([cause, count]) => (
              <div key={cause} className="flex items-center gap-3 mb-1.5">
                <span className="text-2xs font-bold text-slate-600 w-28 truncate">{cause.split('-').slice(0,2).join('-')}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(count / kpis.totalBroken) * 100}%` }} />
                </div>
                <span className="text-2xs font-black text-slate-700 w-6 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(kpis.byCause).length === 0 && <p className="text-xs text-slate-300 text-center py-4">No data</p>}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 sm:col-span-2">
            <h3 className="text-2xs font-black text-slate-500 uppercase mb-3">Summary</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xs font-black text-slate-400 uppercase">Top Stage</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">{kpis.topStage}</p>
              </div>
              <div className="text-center">
                <p className="text-2xs font-black text-slate-400 uppercase">Top Cause</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">{kpis.topCause.split('-').slice(0,2).join('-')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xs font-black text-slate-400 uppercase">Breakage Rate</p>
                <p className={`text-xl font-black mt-0.5 ${kpis.breakageRate > 2 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {kpis.breakageRate}%
                </p>
                <p className="text-2xs text-slate-400">Target: &lt;2%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>{/* end flex-1 scroll wrapper */}

      {/* Modals */}
      {showForm && (
        <NCRForm
          company={company}
          pieces={pieces}
          jobOrders={jobOrders}
          vendors={vendors}
          onClose={() => setShowForm(false)}
          onSaved={refresh}
        />
      )}

      {selectedNCR && (
        <NCRDetail
          ncr={selectedNCR}
          reproductions={reproductions}
          claims={claims}
          onClose={() => setSelectedNCR(null)}
          onRefresh={refresh}
          company={company}
        />
      )}
    </div>
  );
};

export default NCRModule;
