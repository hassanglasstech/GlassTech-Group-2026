import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X, ShoppingBag } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { Sector, Priority, FactoryEvent } from '../../pages/FactoryInchargeModule';

interface Props {
  sector: Sector;
  eventTypes: string[];
  loggedBy: string;
  onSaved: () => void;
  onCancel: () => void;
}

// Event types that trigger material/tool requisition check
const REQ_TRIGGERS = ['Material Needed', 'Tool Request', 'Stock Low', 'Diesel Request', 'Supply Needed'];

const PRIORITY_OPTIONS: Priority[] = ['Urgent', 'Medium', 'Low'];

const FactoryEventForm: React.FC<Props> = ({ sector, eventTypes, loggedBy, onSaved, onCancel }) => {
  const [eventType, setEventType] = useState('');
  const [detail, setDetail]       = useState('');
  const [priority, setPriority]   = useState<Priority>('Medium');
  const [materialDesc, setMaterialDesc] = useState('');
  const [qty, setQty]             = useState('1');
  const [unit, setUnit]           = useState('Nos');
  const [saving, setSaving]       = useState(false);
  const [stockStatus, setStockStatus] = useState<'idle' | 'checking' | 'available' | 'not_available'>('idle');
  const [savedEvent, setSavedEvent] = useState<FactoryEvent | null>(null);

  const needsReq = REQ_TRIGGERS.includes(eventType);

  // Simulated stock check — replace with real inventory query when inventory table ready
  const checkStock = async () => {
    if (!materialDesc.trim()) return;
    setStockStatus('checking');
    await new Promise(r => setTimeout(r, 700));
    // TODO: query inventory table
    // const { data } = await supabase.from('stock_items').select('qty').ilike('description', `%${materialDesc}%`).limit(1);
    // setStockStatus(data?.[0]?.qty > 0 ? 'available' : 'not_available');
    setStockStatus('not_available'); // default until inventory integrated
  };

  const handleSubmit = async () => {
    if (!eventType || !detail.trim()) return;
    setSaving(true);
    try {
      // 1. Insert factory event
      const eventPayload = {
        sector,
        event_type: eventType,
        detail: detail.trim(),
        priority,
        status: 'Open',
        logged_by: loggedBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: evData, error: evErr } = await supabase
        .from('factory_events')
        .insert(eventPayload)
        .select()
        .single();

      if (evErr) throw evErr;

      let reqId: string | undefined;

      // 2. Auto-create requisition if material/tool needed
      if (needsReq && materialDesc.trim()) {
        const reqPayload = {
          company: 'Factory',
          date: new Date().toISOString().split('T')[0],
          header_text: `[AUTO] ${eventType} - ${sector}`,
          requisitioner: loggedBy,
          priority: priority === 'Urgent' ? 'Urgent' : 'Normal',
          status: 'Pending',
          category: sector,
          req_type: 'Factory Incharge',
          items: JSON.stringify([{
            id: crypto.randomUUID(),
            itemCategory: sector,
            materialDesc: materialDesc.trim(),
            qty: parseFloat(qty) || 1,
            unit,
            estimatedRate: 0,
            deliveryDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            costCenter: 'FACTORY',
          }]),
          total_value: 0,
          source_event_id: evData.id,
          created_at: new Date().toISOString(),
        };

        const { data: reqData } = await supabase
          .from('requisitions')
          .insert(reqPayload)
          .select('id')
          .single();

        if (reqData) {
          reqId = reqData.id;
          // Link req back to event
          await supabase
            .from('factory_events')
            .update({ req_id: reqId, updated_at: new Date().toISOString() })
            .eq('id', evData.id);
        }
      }

      setSavedEvent({ ...evData, req_id: reqId } as FactoryEvent);
    } catch (err) {
      console.error('Event save error:', err);
    }
    setSaving(false);
  };

  if (savedEvent) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 text-center space-y-3">
        <CheckCircle2 size={40} className="text-green-400 mx-auto" />
        <div className="font-black text-white text-lg">Event Logged</div>
        <div className="text-slate-400 text-sm">
          {savedEvent.event_type} · {savedEvent.priority}
        </div>
        {savedEvent.req_id && (
          <div className="flex items-center justify-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs px-4 py-2 rounded-lg">
            <ShoppingBag size={14} />
            Requisition auto-created &amp; sent for approval
          </div>
        )}
        {savedEvent.priority === 'Urgent' && (
          <div className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-2 rounded-lg">
            <AlertTriangle size={14} />
            Urgent alert will be sent to management
          </div>
        )}
        <button
          onClick={onSaved}
          className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white">Log New Event</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Event Type */}
      <div>
        <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">Event Type *</label>
        <div className="grid grid-cols-2 gap-2">
          {eventTypes.map(t => (
            <button
              key={t}
              onClick={() => { setEventType(t); setStockStatus('idle'); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium text-left transition-all
                ${eventType === t
                  ? 'bg-white text-slate-900 font-bold'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">Priority *</label>
        <div className="flex gap-2">
          {PRIORITY_OPTIONS.map(p => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all
                ${priority === p
                  ? p === 'Urgent' ? 'bg-red-500 text-white'
                  : p === 'Medium' ? 'bg-yellow-500 text-slate-900'
                  : 'bg-slate-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div>
        <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">Detail *</label>
        <textarea
          value={detail}
          onChange={e => setDetail(e.target.value)}
          placeholder="Describe the issue or situation..."
          rows={3}
          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-white/20 resize-none"
        />
      </div>

      {/* Material/Tool fields — only if req-triggering event */}
      {needsReq && (
        <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-4 space-y-3">
          <div className="text-xs text-blue-400 font-bold uppercase tracking-widest">Material / Tool Details</div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <div className="flex gap-2">
              <input
                value={materialDesc}
                onChange={e => { setMaterialDesc(e.target.value); setStockStatus('idle'); }}
                placeholder="e.g. Silicon Tube 300ml"
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                onClick={checkStock}
                disabled={!materialDesc.trim() || stockStatus === 'checking'}
                className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-3 py-2 rounded-lg transition-all disabled:opacity-50"
              >
                {stockStatus === 'checking' ? <Loader2 size={14} className="animate-spin" /> : 'Check Stock'}
              </button>
            </div>
            {stockStatus === 'available' && (
              <div className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <CheckCircle2 size={11} /> Available in store — issue will be processed
              </div>
            )}
            {stockStatus === 'not_available' && (
              <div className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Not in stock — requisition will be created
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Qty</label>
              <input
                type="number"
                value={qty}
                onChange={e => setQty(e.target.value)}
                min="1"
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
              >
                {['Nos', 'Pcs', 'Kg', 'Ltr', 'Mtr', 'Box', 'Roll', 'Set'].map(u => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || !eventType || !detail.trim()}
        className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Submit Event'}
      </button>
    </div>
  );
};

export default FactoryEventForm;
