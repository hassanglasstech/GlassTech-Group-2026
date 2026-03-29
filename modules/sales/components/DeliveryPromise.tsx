/**
 * DeliveryPromise.tsx — Stage 3C
 * Embeddable widget showing calculated earliest delivery date.
 * Uses cutting backlog + vendor TAT + buffer.
 * Also shows vendor suggestion (3B).
 */

import React, { useMemo } from 'react';
import { calculateDeliveryPromise, suggestVendor, VendorTATSummary } from '@/modules/sales/services/deliveryCalcService';
import { Truck, Clock, Zap, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface Props {
  company: string;
  items?: any[];  // quotation items to detect services
  orderValuePKR?: number;
}

const DeliveryPromise: React.FC<Props> = ({ company, items = [], orderValuePKR = 0 }) => {
  // Detect services from items
  const services = useMemo(() => {
    const allServices = new Set<string>();
    items.forEach(item => {
      (item.selectedServices || []).forEach((s: string) => allServices.add(s));
    });
    return {
      hasTemplering: allServices.has('Tempering') || allServices.has('Toughening'),
      hasLamination: allServices.has('Lamination') || allServices.has('Laminated'),
      hasDG: allServices.has('Double Glazing') || allServices.has('DG') || allServices.has('Insulated'),
    };
  }, [items]);

  const needsOutsourcing = services.hasTemplering || services.hasLamination || services.hasDG;

  const estimate = useMemo(() => calculateDeliveryPromise({
    company,
    hasTemperingService: services.hasTemplering,
    hasLaminationService: services.hasLamination,
    hasDGService: services.hasDG,
    orderValuePKR,
  }), [company, services, orderValuePKR]);

  const vendorInfo = useMemo(() => {
    if (!needsOutsourcing) return null;
    return suggestVendor(company, services.hasTemplering ? 'Tempering' : 'Lamination');
  }, [company, needsOutsourcing, services]);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg"><Truck size={12} className="text-white"/></div>
          <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Delivery Estimate</span>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-blue-800">{new Date(estimate.earliestDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          <p className="text-[9px] font-bold text-blue-500">{estimate.totalDays} working days</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex items-center gap-1 text-[9px] font-bold">
        <span className="bg-white px-2 py-1 rounded-lg text-blue-700 border border-blue-100 flex items-center gap-1">
          <Clock size={9}/> Cutting: {estimate.cuttingBacklogDays}d
        </span>
        <ChevronRight size={10} className="text-blue-300"/>
        {needsOutsourcing && (
          <>
            <span className="bg-white px-2 py-1 rounded-lg text-orange-700 border border-orange-100 flex items-center gap-1">
              <Zap size={9}/> Vendor: {estimate.vendorTATDays}d
            </span>
            <ChevronRight size={10} className="text-blue-300"/>
          </>
        )}
        <span className="bg-white px-2 py-1 rounded-lg text-slate-600 border border-slate-100">
          Buffer: {estimate.bufferDays}d
        </span>
      </div>

      {/* Vendor Suggestion */}
      {vendorInfo?.suggestion && (
        <div className="bg-white rounded-xl p-3 border border-blue-100">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Vendor Suggestion</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-800">{vendorInfo.suggestion.vendorName}</p>
              <p className="text-[10px] font-bold text-emerald-600">
                Avg {vendorInfo.suggestion.avgTATDays} days · {vendorInfo.suggestion.totalDispatches} trips · {vendorInfo.suggestion.reliability}% reliable
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700">FASTEST</span>
          </div>
          {vendorInfo.alternatives.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
              {vendorInfo.alternatives.slice(0, 2).map(alt => (
                <div key={alt.vendorId} className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-600">{alt.vendorName}</span>
                  <span className="font-bold text-slate-400">{alt.avgTATDays} days avg · {alt.totalDispatches} trips</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {estimate.notes.length > 0 && (
        <div className="space-y-0.5">
          {estimate.notes.map((n, i) => (
            <p key={i} className="text-[9px] text-blue-500 font-bold flex items-center gap-1">
              <AlertTriangle size={8}/> {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeliveryPromise;
