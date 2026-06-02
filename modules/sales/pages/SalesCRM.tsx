import React, { useState } from 'react';
import ClientMaster from './ClientMaster';
import NipponQuotationManager from '../companies/nippon/NipponQuotationManager';
import SalesPipeline from '../components/SalesPipeline';
import BillingHub from '../../finance/components/BillingHub';
import CustomerComplaintModule from '../components/CustomerComplaintModule';
import { Users, FileSignature, BarChart3, Receipt, MessageSquareWarning } from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';

// Nippon-only Sales desk. Trading flow: quote → invoice direct (no separate
// Sales Order stage, no Design Studio / glass-cutting).
type ActiveTab = 'quotations' | 'clients' | 'pipeline' | 'invoices' | 'complaints';

const styles = `
  .sd-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    margin: -24px;
  }

  .sd-nav {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 20px;
    display: flex;
    align-items: stretch;
    gap: 2px;
    position: sticky;
    top: 0;
    z-index: 30;
    box-shadow: 0 1px 3px rgba(0,0,0,.06);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .sd-nav::-webkit-scrollbar { display: none; }

  .sd-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 13px 18px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #64748b;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: color .15s, border-color .15s, background .15s;
    font-family: inherit;
  }
  .sd-tab:hover {
    color: #1e293b;
    background: #f8fafc;
  }
  .sd-tab.active {
    color: #1d4ed8;
    border-bottom-color: #2563eb;
    background: #eff6ff;
  }

  .sd-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: #f8fafc;
  }
  .sd-body-inner {
    max-width: 1600px;
    margin: 0 auto;
  }
  @media (max-width: 640px) {
    .sd-body { padding: 12px; }
    .sd-tab  { padding: 12px 12px; }
  }
`;

const SalesCRM: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<ActiveTab>('quotations');

  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
    { id: 'quotations', label: 'Quotations',        icon: FileSignature },
    { id: 'clients',    label: 'Business Partners',  icon: Users },
    { id: 'pipeline',   label: 'Pipeline',           icon: BarChart3 },
    { id: 'invoices',   label: 'Invoices & AR',      icon: Receipt },
    { id: 'complaints', label: 'Complaints',         icon: MessageSquareWarning },
  ];

  return (
    <div className="sd-wrap">
      <style>{styles}</style>

      <nav className="sd-nav">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`sd-tab${activeTab === t.id ? ' active' : ''}`}
          >
            <t.icon size={14}/>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="sd-body">
        <div className="sd-body-inner">
          {activeTab === 'quotations' && <NipponQuotationManager />}
          {activeTab === 'clients'    && <ClientMaster />}
          {activeTab === 'pipeline'   && <SalesPipeline />}
          {activeTab === 'invoices'   && <BillingHub company={company} />}
          {activeTab === 'complaints' && <CustomerComplaintModule company={company} />}
        </div>
      </div>
    </div>
  );
};

export default React.memo(SalesCRM);
