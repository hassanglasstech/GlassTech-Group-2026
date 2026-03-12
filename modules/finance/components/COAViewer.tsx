import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import { COAAccount } from '../constants/coa';

interface Props {
  data: COAAccount[];
}

const COATreeNode: React.FC<{ account: COAAccount }> = ({ account }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <div className="ml-4">
      <div 
        className="flex items-center py-1 cursor-pointer hover:bg-slate-100 rounded px-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="mr-1">
          {hasChildren ? (
            isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <FileText size={16} className="text-slate-400" />
          )}
        </span>
        <span className={`font-mono text-sm ${hasChildren ? 'font-bold' : 'text-slate-600'}`}>
          {account.code} - {account.name}
        </span>
      </div>
      {isOpen && hasChildren && (
        <div className="border-l border-slate-200 ml-2">
          {account.children!.map((child) => (
            <COATreeNode key={child.code} account={child} />
          ))}
        </div>
      )}
    </div>
  );
};

const COAViewer: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-bold mb-4">Chart of Accounts</h2>
      <div className="space-y-1">
        {data.map((account) => (
          <COATreeNode key={account.code} account={account} />
        ))}
      </div>
    </div>
  );
};

export default COAViewer;
