import React, { useState } from 'react';
import ClientMaster from './ClientMaster';
import QuotationManager from './QuotationManager';
import NipponQuotationManager from '../companies/nippon/NipponQuotationManager';
import GlasscoQuotationManager from '../companies/glassco/GlasscoQuotationManager';
import GTKQuotationManager from '../companies/gtk/GTKQuotationManager';
import DesignStudio from '../../production/pages/DesignStudio';
import SalesOrders from '../components/SalesOrders';
import SalesPipeline from '../components/SalesPipeline';
import BillingHub from '../../finance/components/BillingHub';
import { Users, FileSignature, Layout, ShoppingCart, BarChart3, Receipt } from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';

type ActiveTab = 'orders' | 'quotations' | 'clients' | 'design' | 'pipeline' | 'invoices';

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
  .sd-tab .sd-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #2563eb;
    color: white;
    font-size: 9px;
    font-weight: 800;
    border-radius: 10px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    margin-left: 2px;
  }
  .sd-tab:not(.active) .sd-badge {
    background: #e2e8f0;
    color: #64748b;
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
`;

const SalesCRM: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  // Default to 'orders' for Glassco (most used) — others start at quotations
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    company === 'Glassco' ? 'orders' : 'quotations'
  );

  const showDesign = company !== 'Glassco' && company !== 'Nippon';

  return (
    <div className="sd-wrap">
      <style>{styles}</style>

      {/* ── Navigation ── */}
      <nav className="sd-nav">

        {/* Sales Orders — first for Glassco (order-centric) */}
        <button
          onClick={() => setActiveTab('orders')}
          className={`sd-tab${activeTab === 'orders' ? ' active' : ''}`}
        >
          <ShoppingCart size={14}/>
          Sales Orders
        </button>

        {/* Quotations */}
        <button
          onClick={() => setActiveTab('quotations')}
          className={`sd-tab${activeTab === 'quotations' ? ' active' : ''}`}
        >
          <FileSignature size={14}/>
          Quotations
        </button>

        {/* Business Partners / Clients */}
        <button
          onClick={() => setActiveTab('clients')}
          className={`sd-tab${activeTab === 'clients' ? ' active' : ''}`}
        >
          <Users size={14}/>
          Business Partners
        </button>

        {/* Design Studio — GTK/GTI only */}
        {showDesign && (
          <button
            onClick={() => setActiveTab('design')}
            className={`sd-tab${activeTab === 'design' ? ' active' : ''}`}
          >
            <Layout size={14}/>
            Design Studio
          </button>
        )}

        {/* Pipeline */}
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`sd-tab${activeTab === 'pipeline' ? ' active' : ''}`}
        >
          <BarChart3 size={14}/>
          Pipeline
        </button>

        {/* Invoices */}
        <button
          onClick={() => setActiveTab('invoices')}
          className={`sd-tab${activeTab === 'invoices' ? ' active' : ''}`}
        >
          <Receipt size={14}/>
          Invoices & AR
        </button>

      </nav>

      {/* ── Content ── */}
      <div className="sd-body">
        <div className="sd-body-inner">

          {activeTab === 'orders' && <SalesOrders />}

          {activeTab === 'quotations' && (
            company === 'Nippon'  ? <NipponQuotationManager /> :
            company === 'Glassco' ? <GlasscoQuotationManager /> :
            company === 'GTK'     ? <GTKQuotationManager /> :
            company === 'GTI'     ? <GTKQuotationManager /> :
            <QuotationManager />
          )}

          {activeTab === 'clients' && <ClientMaster />}

          {activeTab === 'design' && showDesign && <DesignStudio />}

          {activeTab === 'pipeline' && <SalesPipeline />}

          {activeTab === 'invoices' && <BillingHub company={company} />}

        </div>
      </div>
    </div>
  );
};

export default React.memo(SalesCRM);
