import React from 'react';
import { Requisition, RequisitionItem } from '../modules/shared/types';

interface RequisitionPrintProps {
  requisitions: Requisition[];
}

const RequisitionPrint: React.FC<RequisitionPrintProps> = ({ requisitions }) => {
  // Sort requisitions in ascending order by ID
  const sortedRequisitions = [...requisitions].sort((a, b) => a.id.localeCompare(b.id));

  // Group requisitions into chunks of 4 for pagination
  const chunkedRequisitions = [];
  for (let i = 0; i < sortedRequisitions.length; i += 4) {
    chunkedRequisitions.push(sortedRequisitions.slice(i, i + 4));
  }

  return (
    <div className="print-container hidden print:block bg-white text-black font-sans">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-container { display: block !important; }
          .page-break { page-break-after: always; }
        }
      `}</style>

      {chunkedRequisitions.map((chunk, pageIndex) => (
        <div key={pageIndex} className={pageIndex < chunkedRequisitions.length - 1 ? 'page-break' : ''}>
          <div className="grid grid-cols-1 gap-8">
            {chunk.map((req) => (
              <div key={req.id} className="border border-black p-4 text-xs">
                {/* Header */}
                <div className="flex justify-between items-start border-b border-black pb-2 mb-2">
                  <div>
                    <h1 className="font-bold text-lg uppercase">Requisition Slip</h1>
                    <p className="font-bold">ID: {req.id}</p>
                    <p>Date: {req.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold uppercase">{req.reqType || 'Material'}</p>
                    <p>Priority: {req.priority}</p>
                  </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div>
                    <p><span className="font-bold">Department:</span> {req.category || 'General'}</p>
                    <p><span className="font-bold">Description:</span> {req.headerText}</p>
                    {req.employeeId && (
                      <p>
                        <span className="font-bold">Employee:</span> {req.employeeName} ({req.employeeId})
                      </p>
                    )}
                    {req.overtimeProject && <p><span className="font-bold">Project:</span> {req.overtimeProject}</p>}
                  </div>
                  <div className="text-right">
                    {req.totalValue > 0 && <p><span className="font-bold">Total Value:</span> PKR {req.totalValue.toLocaleString()}</p>}
                    {req.loanAmount > 0 && <p><span className="font-bold">Loan Amount:</span> PKR {req.loanAmount.toLocaleString()}</p>}
                    {req.overtimeHours > 0 && <p><span className="font-bold">OT Hours:</span> {req.overtimeHours}</p>}
                  </div>
                </div>

                {/* Items Table (if Material) */}
                {['Material / Inventory', 'Maintenance / R&M', 'General Expense'].includes(req.subCategory || req.reqType) && req.items && req.items.length > 0 && (
                  <table className="w-full text-left border-collapse border border-black mb-2 text-[10px]">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-black px-1">Item</th>
                        <th className="border border-black px-1">Qty</th>
                        <th className="border border-black px-1">Unit</th>
                        <th className="border border-black px-1">Rate</th>
                        <th className="border border-black px-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {req.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="border border-black px-1">{item.materialDesc}</td>
                          <td className="border border-black px-1 text-center">{item.qty}</td>
                          <td className="border border-black px-1 text-center">{item.unit}</td>
                          <td className="border border-black px-1 text-right">{item.estimatedRate?.toLocaleString()}</td>
                          <td className="border border-black px-1 text-right">{(item.qty * item.estimatedRate).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* HR Specific Details */}
                {(req.subCategory === 'Loan Request' || req.reqType === 'Loan') && (
                   <div className="mb-2">
                     <p><span className="font-bold">Purpose:</span> {req.loanPurpose}</p>
                     <p><span className="font-bold">Installments:</span> {req.installments}</p>
                   </div>
                )}
                {(req.subCategory === 'Salary Advance' || req.reqType === 'Advance') && (
                   <div className="mb-2">
                     <p><span className="font-bold">Purpose:</span> {req.loanPurpose}</p>
                   </div>
                )}
                {(req.subCategory === 'Waive Absent' || req.reqType === 'Waive Absent') && (
                   <div className="mb-2">
                     <p><span className="font-bold">Absent Date:</span> {req.absentDate}</p>
                     <p><span className="font-bold">Reason:</span> {req.absentReason}</p>
                   </div>
                )}
                {(req.subCategory === 'Skip Installment' || req.reqType === 'Skip Installment') && (
                   <div className="mb-2">
                     <p><span className="font-bold">Skip Month:</span> {req.skipMonth}</p>
                   </div>
                )}
                 {(req.subCategory === 'Overtime Approval' || req.reqType === 'Overtime') && req.overtimeEmployees && (
                   <div className="mb-2">
                     <p><span className="font-bold">Employees:</span> {req.overtimeEmployees.length} Selected</p>
                   </div>
                )}


                {/* Approval Section */}
                <div className="mt-4 pt-2 border-t border-black grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold">Status:</span>
                      <span className="border border-black px-2 py-0.5 uppercase font-bold">{req.status}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold">Date:</span>
                      <div className="flex-1 border-b border-black h-4"></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="h-8 border-b border-black mb-1"></div>
                    <p className="font-bold text-[10px]">Reviewed By</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-start space-x-2">
                      <span className="font-bold">Remarks:</span>
                      <div className="flex-1 border-b border-black h-8"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RequisitionPrint;
