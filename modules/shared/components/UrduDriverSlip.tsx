/**
 * UrduDriverSlip — Gate Pass D. A big, clear Urdu (Noori Nastaliq) slip for the
 * driver: what he is carrying, where to deliver, any special instruction, and the
 * phone number. Mobile-first + printable. Built for a low-literacy, Urdu-only
 * driver — the thing SAP/Odoo will never ship.
 */

import React from 'react';
import { Quotation } from '@/modules/shared/types';
import { X, Printer } from 'lucide-react';
import './urduSlip.css';

interface Props {
  order: Quotation;
  clientName: string;
  onClose: () => void;
}

const UrduDriverSlip: React.FC<Props> = ({ order, clientName, onClose }) => {
  const gp = order.gatePass;
  const lines = (order.items || []).filter(i => !i.isSection);
  const itemsText = lines.map(i => `${i.description || ''} × ${Number(i.qty) || 0}`).join('، ');

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-[600] flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between no-print shrink-0">
          <span className="text-sm font-black uppercase">Driver Slip · Urdu</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => window.print()} title="Print" className="p-2 hover:bg-white/10 rounded-lg"><Printer size={16}/></button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg"><X size={16}/></button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="urdu-slip">
            <div className="us-title">گیٹ پاس — ڈرائیور پرچی</div>

            <div className="us-row">
              <span className="us-label">آرڈر نمبر:</span>
              <span className="us-value">{order.orderNo || order.id}</span>
            </div>
            <div className="us-row">
              <span className="us-label">گاہک:</span>
              <span className="us-value">{clientName || '—'}</span>
            </div>
            {gp?.vehicleNo && (
              <div className="us-row">
                <span className="us-label">گاڑی نمبر:</span>
                <span className="us-value"><span className="us-phone">{gp.vehicleNo}</span></span>
              </div>
            )}
            {gp?.driverName && (
              <div className="us-row">
                <span className="us-label">ڈرائیور:</span>
                <span className="us-value">{gp.driverName}</span>
              </div>
            )}
            {gp?.driverPhone && (
              <div className="us-row">
                <span className="us-label">فون نمبر:</span>
                <span className="us-value"><span className="us-phone">{gp.driverPhone}</span></span>
              </div>
            )}
            <div className="us-row">
              <span className="us-label">سامان:</span>
              <span className="us-value us-items">{itemsText || '—'}</span>
            </div>
            {gp?.isReturnable && (
              <div className="us-row">
                <span className="us-label">واپسی:</span>
                <span className="us-value">گاڑی / سامان واپس آنا ہے</span>
              </div>
            )}
            {(gp?.instructions || order.specialInstructions) && (
              <div className="us-instructions">
                خاص ہدایت: {gp?.instructions || order.specialInstructions}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UrduDriverSlip;
