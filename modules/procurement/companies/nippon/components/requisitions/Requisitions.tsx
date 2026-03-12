
import React, { useState, useMemo } from 'react';
import { Requisition, Client, Product, CostCenter } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { RequisitionsList } from '@/modules/procurement/companies/glassco/components/requisitions/RequisitionsList';
import { RequisitionEditor } from '@/modules/procurement/companies/glassco/components/requisitions/RequisitionEditor';

interface Props {
  requisitions: Requisition[];
}

const Requisitions: React.FC<Props> = ({ requisitions: initialRequisitions }) => {
  const company = 'Nippon';
  const [requisitions, setRequisitions] = useState<Requisition[]>(initialRequisitions);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Requisition> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const products = useMemo(() => SalesService.getProducts().filter(p => p.company === company), []);
  const costCenters = useMemo(() => FinanceService.getCostCenters().filter(c => c.company === company), []);

  const filteredRequisitions = useMemo(() => {
    return requisitions.filter(r => 
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.headerText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.requisitioner.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [requisitions, searchTerm]);

  const handleSave = (data: Requisition) => {
    const all = InventoryService.getRequisitions();
    const updated = all.filter(r => r.id !== data.id);
    const final = [...updated, data];
    InventoryService.saveRequisitions(final);
    setRequisitions(final.filter(r => r.company === company));
    setIsEditorOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this requisition?')) {
      const all = InventoryService.getRequisitions();
      const final = all.filter(r => r.id !== id);
      InventoryService.saveRequisitions(final);
      setRequisitions(final.filter(r => r.company === company));
    }
  };

  return (
    <div className="space-y-6">
      {!isEditorOpen ? (
        <RequisitionsList 
          requisitions={filteredRequisitions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onNew={() => {
            setFormData({
              id: `PR-NIP-${Date.now()}`,
              company,
              date: new Date().toISOString().split('T')[0],
              headerText: '',
              requisitioner: 'Admin',
              priority: 'Normal',
              items: [],
              totalValue: 0,
              status: 'Draft'
            });
            setIsEditorOpen(true);
          }}
          onEdit={(r) => {
            setFormData(r);
            setIsEditorOpen(true);
          }}
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
