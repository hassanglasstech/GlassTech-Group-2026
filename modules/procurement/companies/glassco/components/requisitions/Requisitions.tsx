
import React, { useState, useMemo } from 'react';
import { Requisition, Client, Product, CostCenter } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { RequisitionsList } from './RequisitionsList';
import { RequisitionEditor } from './RequisitionEditor';
import { toast } from 'sonner';

interface Props {
  requisitions: Requisition[];
}

const Requisitions: React.FC<Props> = ({ requisitions: initialRequisitions }) => {
  const company = 'Glassco';
  const [requisitions, setRequisitions] = useState<Requisition[]>(initialRequisitions);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Requisition> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const products    = useMemo(() => SalesService.getProducts().filter(p => p.company === company), []);
  const costCenters = useMemo(() => FinanceService.getCostCenters().filter(c => c.company === company), []);

  const filteredRequisitions = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return requisitions.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.headerText.toLowerCase().includes(q) ||
      r.requisitioner.toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q)
    );
  }, [requisitions, searchTerm]);

  const persist = (updated: Requisition[]) => {
    const all   = InventoryService.getRequisitions();
    const other = all.filter(r => r.company !== company);
    InventoryService.saveRequisitions([...other, ...updated]);
    setRequisitions(updated);
  };

  const handleSave = (data: Requisition) => {
    const current = requisitions.filter(r => r.id !== data.id);
    persist([...current, data]);
    setIsEditorOpen(false);
    toast.success(`Requisition ${data.id} saved`, { duration: 3000 });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this requisition?')) return;
    persist(requisitions.filter(r => r.id !== id));
    toast.success('Requisition deleted');
  };

  // ── MD Approve ──────────────────────────────────────────────────────────
  const handleApprove = (r: Requisition) => {
    const approved: Requisition = {
      ...r,
      status:      'Approved',
      approvedBy:  'MD',
      paymentStatus: r.requiresCashPayment ? 'Pending' : 'Not Required',
    };

    // Auto-create Parked PV when cash payment is flagged
    if (r.requiresCashPayment) {
      try {
        const pv = FinanceService.createParkedPV(approved);
        approved.paymentRef = pv.id;          // link PV id back to req
        toast.success(
          `Approved ✓  Parked PV created: ${pv.id} — Finance must review and post`,
          { duration: 6000 }
        );
      } catch (e) {
        toast.error('Approval saved but PV creation failed — check Finance module', { duration: 5000 });
      }
    } else {
      toast.success(`Requisition ${r.id} approved`, { duration: 3000 });
    }

    const current = requisitions.filter(req => req.id !== r.id);
    persist([...current, approved]);
  };

  // ── MD Reject ───────────────────────────────────────────────────────────
  const handleReject = (r: Requisition, reason: string) => {
    const rejected: Requisition = {
      ...r,
      status:      'Rejected',
      approvedBy:  'MD',
      paymentStatus: 'Not Required',
      headerText:  `${r.headerText} [REJECTED: ${reason}]`,
    };
    const current = requisitions.filter(req => req.id !== r.id);
    persist([...current, rejected]);
    toast.error(`Requisition ${r.id} rejected`, { duration: 3000 });
  };

  return (
    <div className="space-y-6">
      {!isEditorOpen ? (
        <RequisitionsList
          requisitions={filteredRequisitions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onApprove={handleApprove}
          onReject={handleReject}
          onNew={() => {
            setFormData({
              id:           `PR-${Date.now()}`,
              company,
              date:         new Date().toISOString().split('T')[0],
              headerText:   '',
              requisitioner:'Admin',
              priority:     'Normal',
              items:        [],
              totalValue:   0,
              status:       'Draft',
              requiresCashPayment: false,
              paymentStatus: 'Not Required',
            });
            setIsEditorOpen(true);
          }}
          onEdit={(r) => { setFormData(r); setIsEditorOpen(true); }}
          onDelete={handleDelete}
        />
      ) : (
        <RequisitionEditor
          formData={formData!}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSave}
          products={products}
          costCenters={costCenters}
        />
      )}
    </div>
  );
};

export default Requisitions;
