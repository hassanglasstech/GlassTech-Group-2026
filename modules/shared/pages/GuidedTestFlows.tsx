import { useState, useMemo, useCallback, useEffect } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// GlassTech ERP — Interactive Guided Test Flows
// SAP-Style visual flow + step-by-step input collection + live GL entries
// ══════════════════════════════════════════════════════════════════════════════

const fmt = (n) => n != null && !isNaN(n) ? Number(n).toLocaleString() : "0";
const n = (v) => Number(v) || 0;

// ── Module Colors ────────────────────────────────────────────────────
const MOD = {
  STORE:   { color:"#27AE60", bg:"#27AE6012", label:"Material Management", icon:"WH" },
  SALES:   { color:"#2980B9", bg:"#2980B912", label:"Sales & Distribution", icon:"SD" },
  HR:      { color:"#E67E22", bg:"#E67E2212", label:"HCM / Payroll", icon:"HR" },
  FINANCE: { color:"#1A3A5C", bg:"#1A3A5C18", label:"FICO / Finance", icon:"FI" },
  MASTERS: { color:"#6C3483", bg:"#6C348312", label:"Master Data", icon:"MD" },
};

// ══════════════════════════════════════════════════════════════════════════════
// ALL GUIDED TESTS — 24 tests, 5 modules
// Each phase: inputs (user fills) → fields (computed) → gl (live amounts)
// ══════════════════════════════════════════════════════════════════════════════
const GUIDED_TESTS = {
  STORE: [
    { id:"GT-ST01", name:"Stock Opening Balance (561)", desc:"Item create karo, opening stock post karo, GL journal OB, Trial Balance verify",
      phases:[
        { id:"p1", title:"Fiscal Period Verify", module:"FINANCE", icon:"FP", tcode:"OB52",
          trigger:"Ensure fiscal period is Open before posting",
          table:"fiscal_periods",
          inputs:[
            {key:"month",label:"Fiscal Month",type:"text",placeholder:"2026-04"},
            {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]},
          ],
          fields:(v)=>[{name:"Period",value:v.month||"—",desc:"Must be Open"},{name:"Status",value:"Open",desc:"Required"}],
          gl:null, checks:["Period exists in fiscal_periods","status = Open"],
        },
        { id:"p2", title:"Create / Verify Item in Store", module:"STORE", icon:"MM01", tcode:"MM01",
          trigger:"Item must exist in ITEM_MASTER before posting stock",
          table:"store_items",
          inputs:[
            {key:"item_id",label:"Item ID",type:"text",placeholder:"ITM-GCO-001"},
            {key:"item_name",label:"Item Name",type:"text",placeholder:"Float Glass 5mm Clear"},
            {key:"uom",label:"Unit of Measure",type:"select",options:["SqFt","SqMtr","Pcs","KG","Ltr"]},
          ],
          fields:(v)=>[{name:"Item",value:v.item_name||"—",desc:v.item_id||""},{name:"UoM",value:v.uom||"SqFt",desc:"Measurement unit"}],
          gl:null, checks:["Item exists in store_items","UoM set","movingAveragePrice initialized"],
        },
        { id:"p3", title:"Post Opening Balance (mvmnt 561)", module:"STORE", icon:"MB1C", tcode:"MB1C",
          trigger:"Enter opening qty and MAP — stock ledger entry created",
          table:"stock_ledger",
          inputs:[
            {key:"qty",label:"Opening Qty",type:"number",placeholder:"360"},
            {key:"map",label:"MAP (PKR per unit)",type:"number",placeholder:"450"},
          ],
          fields:(v)=>[
            {name:"Total Value",value:`PKR ${fmt(n(v.qty)*n(v.map))}`,desc:`${v.qty||0} × ${v.map||0}`},
            {name:"Movement",value:"561 (Opening Balance)",desc:"Stock initialization"},
            {name:"Balance After",value:`${v.qty||0} ${v.uom||"SqFt"}`,desc:"New stock balance"},
          ],
          gl:null, checks:["mvmntCode = 561","qty > 0","balance_after > 0","valuation = MAP"],
        },
        { id:"p4", title:"GL Journal — Opening Balance (OB)", module:"FINANCE", icon:"FB50", tcode:"FB50",
          trigger:"Post double-entry GL: Dr Inventory / Cr Owner Capital",
          table:"ledger",
          inputs:[
            {key:"dr_code",label:"Debit GL Code",type:"text",placeholder:"11511"},
            {key:"dr_name",label:"Debit Account Name",type:"text",placeholder:"Inventory — Glass"},
            {key:"cr_code",label:"Credit GL Code",type:"text",placeholder:"31111"},
            {key:"cr_name",label:"Credit Account Name",type:"text",placeholder:"Owner Capital"},
          ],
          fields:(v)=>[{name:"Doc Type",value:"OB",desc:"Opening Balance"},{name:"Status",value:"Posted",desc:"Direct post"}],
          gl:(v)=>({docType:"OB",status:"Posted",id:"OB-"+Date.now().toString().slice(-6),
            entries:[
              {side:"Dr",code:v.dr_code||"11511",name:v.dr_name||"Inventory",amount:fmt(n(v.qty)*n(v.map))},
              {side:"Cr",code:v.cr_code||"31111",name:v.cr_name||"Owner Capital",amount:fmt(n(v.qty)*n(v.map))},
            ],
            note:"Dr = Cr. Inventory asset created, funded by owner equity."
          }),
          checks:["doc_type = OB","Dr = Cr","status = Posted","period = Open"],
        },
        { id:"p5", title:"Trial Balance Verify", module:"FINANCE", icon:"S_ALR", tcode:"S_ALR_87012",
          trigger:"Verify total debits = total credits after posting",
          table:"trial_balance",
          inputs:[{key:"result",label:"Trial Balance Result",type:"select",options:["BALANCED","IMBALANCE"]}],
          fields:(v)=>[
            {name:`GL ${v.dr_code||"11511"}`,value:`Dr PKR ${fmt(n(v.qty)*n(v.map))}`,desc:v.dr_name||"Inventory"},
            {name:`GL ${v.cr_code||"31111"}`,value:`Cr PKR ${fmt(n(v.qty)*n(v.map))}`,desc:v.cr_name||"Owner Capital"},
          ],
          gl:null, checks:["Total Dr = Total Cr (±1 PKR)","Inventory GL balance > 0","Capital GL balance > 0"],
        },
      ]
    },
    { id:"GT-ST02", name:"GRN → Stock → MAP Recalc (IAS 2)", desc:"Goods receipt, freight allocation by weight, IAS 2 MAP formula",
      phases:[
        { id:"p1", title:"Vendor Verify", module:"STORE", icon:"XK03", tcode:"XK03",
          trigger:"Verify vendor exists and is Active", table:"vendors",
          inputs:[
            {key:"vendor",label:"Vendor Name",type:"text",placeholder:"Ghani Glass"},
            {key:"vendor_type",label:"Type",type:"select",options:["Glass","Tempering","Transport","Hardware"]},
          ],
          fields:(v)=>[{name:"Vendor",value:v.vendor||"—",desc:v.vendor_type||""}],
          gl:null, checks:["Vendor exists","type matches","status = Active"],
        },
        { id:"p2", title:"GRN Entry — Qty, Rate, Freight", module:"STORE", icon:"MIGO", tcode:"MIGO",
          trigger:"Enter received qty, vendor rate, and freight charges", table:"store_items + stock_ledger",
          inputs:[
            {key:"item_name",label:"Item",type:"text",placeholder:"Float Glass 5mm"},
            {key:"old_qty",label:"Existing Stock Qty",type:"number",placeholder:"360"},
            {key:"old_map",label:"Current MAP",type:"number",placeholder:"450"},
            {key:"recv_qty",label:"Received Qty",type:"number",placeholder:"240"},
            {key:"rate",label:"Vendor Rate (PKR/unit)",type:"number",placeholder:"600"},
            {key:"freight",label:"Freight PKR",type:"number",placeholder:"4500"},
            {key:"weight",label:"Total Weight KG",type:"number",placeholder:"480"},
          ],
          fields:(v)=>{
            const landed = (n(v.recv_qty)*n(v.rate)+n(v.freight))/Math.max(1,n(v.recv_qty));
            const newMAP = (n(v.old_qty)*n(v.old_map)+n(v.recv_qty)*landed)/(n(v.old_qty)+n(v.recv_qty));
            const totalVal = (n(v.old_qty)+n(v.recv_qty))*newMAP;
            return [
              {name:"Landed Cost/Unit",value:`PKR ${landed.toFixed(2)}`,desc:`(${v.recv_qty}×${v.rate}+${v.freight})÷${v.recv_qty}`},
              {name:"New MAP (IAS 2)",value:`PKR ${newMAP.toFixed(2)}`,desc:`(${v.old_qty}×${v.old_map}+${v.recv_qty}×${landed.toFixed(0)})÷${n(v.old_qty)+n(v.recv_qty)}`},
              {name:"New Total Value",value:`PKR ${fmt(Math.round(totalVal))}`,desc:`${n(v.old_qty)+n(v.recv_qty)} × ${newMAP.toFixed(2)}`},
              {name:"New Balance",value:`${n(v.old_qty)+n(v.recv_qty)} units`,desc:"old + received"},
            ];
          },
          gl:(v)=>{
            const total = n(v.recv_qty)*n(v.rate)+n(v.freight);
            return {docType:"KR",status:"Posted",id:"GRN-"+Date.now().toString().slice(-6),
              entries:[
                {side:"Dr",code:"11511",name:"Inventory — Glass",amount:fmt(total)},
                {side:"Cr",code:"21151",name:"GR/IR Clearing",amount:fmt(n(v.recv_qty)*n(v.rate))},
                {side:"Cr",code:"11112",name:"Cash (Freight)",amount:fmt(n(v.freight))},
              ],
              note:"Inventory debited at full landed cost. Freight capitalized per IAS 2."
            };
          },
          checks:["mvmntCode = 101","Landed > vendor rate (freight absorbed)","MAP recalculated","stock_ledger entry created"],
        },
      ]
    },
    { id:"GT-ST03", name:"Material Issue (201)", desc:"Issue material to cost center — stock deduction at MAP",
      phases:[
        { id:"p1", title:"Select Item & Quantity", module:"STORE", icon:"MB1A", tcode:"MB1A",
          trigger:"Choose item and issue quantity", table:"store_items",
          inputs:[
            {key:"item_name",label:"Item",type:"text",placeholder:"Float Glass 5mm"},
            {key:"available",label:"Available Qty",type:"number",placeholder:"600"},
            {key:"issue_qty",label:"Issue Qty",type:"number",placeholder:"50"},
            {key:"map",label:"Current MAP",type:"number",placeholder:"517.50"},
            {key:"cost_center",label:"Cost Center",type:"text",placeholder:"CC-1001 Cutting"},
          ],
          fields:(v)=>[
            {name:"Issue Value",value:`PKR ${fmt(n(v.issue_qty)*n(v.map))}`,desc:`${v.issue_qty} × ${v.map}`},
            {name:"Remaining",value:`${n(v.available)-n(v.issue_qty)} units`,desc:"After issue"},
          ],
          gl:(v)=>({docType:"GI",status:"Posted",id:"MI-"+Date.now().toString().slice(-6),
            entries:[
              {side:"Dr",code:"52xxx",name:`Cost Center: ${v.cost_center||"CC"}`,amount:fmt(n(v.issue_qty)*n(v.map))},
              {side:"Cr",code:"11511",name:"Inventory — Glass",amount:fmt(n(v.issue_qty)*n(v.map))},
            ],
            note:"Inventory reduced at MAP. Cost allocated to cost center."
          }),
          checks:["mvmntCode = 201","qty <= available (InsufficientStockError if not)","valuation = MAP","costCenterId attached"],
        },
      ]
    },
    { id:"GT-ST04", name:"Remnant Creation (551)", desc:"Usable glass offcut from cutting session",
      phases:[
        { id:"p1", title:"Create Remnant from Cutting", module:"STORE", icon:"MB1C", tcode:"MB1C",
          trigger:"Record usable offcut after glass cutting", table:"remnants + stock_ledger",
          inputs:[
            {key:"parent_tag",label:"Parent Sheet Tag",type:"text",placeholder:"GLS-05MM-0226-001-01"},
            {key:"shape",label:"Shape",type:"select",options:["Rectangle","L-Shape"]},
            {key:"width",label:"Width (inches)",type:"number",placeholder:"24"},
            {key:"height",label:"Height (inches)",type:"number",placeholder:"36"},
          ],
          fields:(v)=>[
            {name:"SqFt",value:`${(n(v.width)*n(v.height)/144).toFixed(2)}`,desc:`${v.width}×${v.height}÷144`},
            {name:"Remnant ID",value:`REM-5MM-MMYY-XXX`,desc:"Auto-generated"},
            {name:"Status",value:"Available",desc:"Ready for use"},
          ],
          gl:null, checks:["mvmntCode = 551","parentTagId linked","status = Available","binLocation assigned"],
        },
      ]
    },
    { id:"GT-ST05", name:"Requisition → Approval → PO", desc:"Material request with L1/L2/L3 approval, convert to PO",
      phases:[
        { id:"p1", title:"Submit Requisition", module:"STORE", icon:"ME51N", tcode:"ME51N",
          trigger:"Create purchase requisition for material need", table:"requisitions",
          inputs:[
            {key:"category",label:"Category",type:"select",options:["Store Purchase","Production","Admin","R&M","Factory"]},
            {key:"sub_cat",label:"Sub-Category",type:"select",options:["BOM Hardware","Aluminium Profiles","Consumables","Glass Purchase","Tool Purchase"]},
            {key:"amount",label:"Estimated Value PKR",type:"number",placeholder:"180000"},
            {key:"priority",label:"Priority",type:"select",options:["Normal","Urgent","Low"]},
          ],
          fields:(v)=>{
            const lvl = n(v.amount)<100000?"L1 (Dept Mgr)":n(v.amount)<=500000?"L2 (Director)":"L3 (MD/CEO)";
            return [{name:"Approval Level",value:lvl,desc:`PKR ${fmt(n(v.amount))}`},{name:"Status",value:"Pending",desc:"Awaiting approval"}];
          },
          gl:null, checks:["REQ ID auto-generated","status = Pending","approvalLevel auto-set"],
        },
        { id:"p2", title:"Approve Requisition", module:"STORE", icon:"ME54N", tcode:"ME54N",
          trigger:"Manager/Director/MD approves based on amount", table:"requisitions",
          inputs:[
            {key:"approved_by",label:"Approved By",type:"text",placeholder:"Pervez Akhtar"},
          ],
          fields:(v)=>[{name:"Approved By",value:v.approved_by||"—",desc:"Approver"},{name:"Status",value:"Approved",desc:"Ready for PO"}],
          gl:null, checks:["status → Approved","approved_by populated","approval_date set"],
        },
        { id:"p3", title:"Convert to Purchase Order", module:"STORE", icon:"ME21N", tcode:"ME21N",
          trigger:"Create PO from approved requisition", table:"purchase_orders",
          inputs:[
            {key:"vendor",label:"Vendor",type:"text",placeholder:"Ghani Glass"},
          ],
          fields:(v)=>[
            {name:"PO Amount",value:`PKR ${fmt(n(v.amount))}`,desc:"From requisition"},
            {name:"Vendor",value:v.vendor||"—",desc:"Supplier"},
            {name:"Match Status",value:"Pending",desc:"Awaiting GRN for 3-way match"},
          ],
          gl:null, checks:["PO created","req_id linked","status = Sent","matchStatus = Pending"],
        },
      ]
    },
  ],
  SALES: [
    { id:"GT-SL01", name:"Quotation → SO → Pieces", desc:"Client quotation se production pieces tak",
      phases:[
        { id:"p1", title:"Create Quotation", module:"SALES", icon:"VA01", tcode:"VA01",
          trigger:"Enter client, project, glass items", table:"quotations",
          inputs:[
            {key:"client",label:"Client Name",type:"text",placeholder:"Gulshan Towers"},
            {key:"project",label:"Project",type:"text",placeholder:"Phase 2 Windows"},
            {key:"qty",label:"Total Pieces",type:"number",placeholder:"12"},
            {key:"sqft",label:"Total SqFt",type:"number",placeholder:"280"},
            {key:"rate",label:"Rate PKR/SqFt",type:"number",placeholder:"900"},
          ],
          fields:(v)=>[{name:"Total Amount",value:`PKR ${fmt(n(v.sqft)*n(v.rate))}`,desc:`${v.sqft} × ${v.rate}`},{name:"Status",value:"Draft → Sent",desc:"Quotation lifecycle"}],
          gl:null, checks:["QT ID: GT-QUT-GLS-MMYY-XXXX","status = Sent","items JSONB populated"],
        },
        { id:"p2", title:"Approve → Generate SO + Pieces", module:"SALES", icon:"VA02", tcode:"VA02",
          trigger:"Approve quotation — auto-generates SO and production pieces", table:"quotations + production_pieces",
          inputs:[{key:"approve",label:"Action",type:"select",options:["Approve → SO"]}],
          fields:(v)=>[
            {name:"SO ID",value:"GT-SO-GLS-MMYY-XXXX",desc:"Same series as QT"},
            {name:"Pieces",value:`${v.qty||12} pieces generated`,desc:"Format: last4/serial"},
            {name:"Amount",value:`PKR ${fmt(n(v.sqft)*n(v.rate))}`,desc:"Carried from quotation"},
          ],
          gl:null, checks:["SO ID generated","status → Approved","Pieces in production_pieces","Piece format: XXXX/N"],
        },
      ]
    },
    { id:"GT-SL02", name:"Delivery Invoice (DR)", desc:"Sales invoice — Dr AR / Cr Revenue + optional GST",
      phases:[
        { id:"p1", title:"Generate Invoice from SO", module:"SALES", icon:"VF01", tcode:"VF01",
          trigger:"Trigger invoice from Approved sales order", table:"invoices + ledger",
          inputs:[
            {key:"client",label:"Client",type:"text",placeholder:"Gulshan Towers"},
            {key:"amount",label:"Invoice Amount PKR",type:"number",placeholder:"252000"},
            {key:"gst",label:"GST %",type:"number",placeholder:"0"},
          ],
          fields:(v)=>{
            const gstAmt = n(v.amount)*n(v.gst)/100;
            return [
              {name:"Subtotal",value:`PKR ${fmt(n(v.amount))}`,desc:"Before GST"},
              {name:"GST",value:`PKR ${fmt(gstAmt)}`,desc:`${v.gst||0}%`},
              {name:"Grand Total",value:`PKR ${fmt(n(v.amount)+gstAmt)}`,desc:"Invoice total"},
            ];
          },
          gl:(v)=>{
            const gstAmt = n(v.amount)*n(v.gst)/100;
            const total = n(v.amount)+gstAmt;
            const entries = [
              {side:"Dr",code:"1221",name:"Trade Receivables",amount:fmt(total)},
              {side:"Cr",code:"41110",name:"Service Revenue",amount:fmt(n(v.amount))},
            ];
            if(gstAmt>0) entries.push({side:"Cr",code:"2214",name:"GST Payable",amount:fmt(gstAmt)});
            return {docType:"DR",status:"Posted",id:"GT-INV-GLS-MMYY-XXXX",entries,
              note:"Revenue recognized. AR created. Invoice status = Outstanding."};
          },
          checks:["doc_type = DR","Dr = Cr","Invoice ID format correct","status = Posted"],
        },
      ]
    },
    { id:"GT-SL03", name:"Payment Receipt (DZ)", desc:"Customer payment — Dr Bank / Cr AR",
      phases:[
        { id:"p1", title:"Record Customer Payment", module:"FINANCE", icon:"F-28", tcode:"F-28",
          trigger:"Customer pays against outstanding invoice", table:"ledger + invoice_balances",
          inputs:[
            {key:"invoice",label:"Invoice ID",type:"text",placeholder:"GT-INV-GLS-0426-0001"},
            {key:"inv_amount",label:"Invoice Total PKR",type:"number",placeholder:"252000"},
            {key:"payment",label:"Payment Amount PKR",type:"number",placeholder:"150000"},
            {key:"bank",label:"Bank",type:"select",options:["HBL","Meezan","MCB"]},
          ],
          fields:(v)=>[
            {name:"Outstanding After",value:`PKR ${fmt(n(v.inv_amount)-n(v.payment))}`,desc:"Remaining balance"},
            {name:"Status",value:n(v.payment)>=n(v.inv_amount)?"Paid":"Partial",desc:"Invoice status after payment"},
          ],
          gl:(v)=>({docType:"DZ",status:"Posted",id:"RCP-"+Date.now().toString().slice(-6),
            entries:[
              {side:"Dr",code:"11121",name:`Bank — ${v.bank||"HBL"}`,amount:fmt(n(v.payment))},
              {side:"Cr",code:"1221",name:"Trade Receivables",amount:fmt(n(v.payment))},
            ],
            note:"Bank balance increases, AR decreases by payment amount."
          }),
          checks:["doc_type = DZ","bank balance increases","AR balance decreases","status = Partial or Paid"],
        },
      ]
    },
    { id:"GT-SL04", name:"Credit Note / Invoice Void", desc:"Partial reversal (CN) or full void with GL",
      phases:[
        { id:"p1", title:"Issue Credit Note", module:"SALES", icon:"VF01", tcode:"VF01",
          trigger:"Issue credit for quality claim or overcharge", table:"invoices + ledger",
          inputs:[
            {key:"invoice",label:"Invoice ID",type:"text",placeholder:"GT-INV-GLS-0426-0001"},
            {key:"credit_amount",label:"Credit Amount PKR",type:"number",placeholder:"30000"},
            {key:"reason",label:"Reason",type:"text",placeholder:"Quality claim settlement"},
          ],
          fields:(v)=>[{name:"CN ID",value:"CN-GLS-2026-XXXX",desc:"Sequential"},{name:"Type",value:"Reversal (RV)",desc:"Partial reversal"}],
          gl:(v)=>({docType:"RV",status:"Posted",id:"CN-GLS-2026-XXXX",
            entries:[
              {side:"Dr",code:"41110",name:"Revenue (reversal)",amount:fmt(n(v.credit_amount))},
              {side:"Cr",code:"1221",name:"Trade Receivables",amount:fmt(n(v.credit_amount))},
            ],
            note:"Revenue reversed, AR reduced. Invoice balance decreases."
          }),
          checks:["amount <= invoice.balance","doc_type = RV","status = Posted"],
        },
      ]
    },
    { id:"GT-SL05", name:"NCR Breakage Report", desc:"Breakage logging with dispose/reproduce/vendor-claim",
      phases:[
        { id:"p1", title:"Report Breakage", module:"SALES", icon:"QM01", tcode:"QM01",
          trigger:"Log broken piece with cause code and action", table:"production_pieces",
          inputs:[
            {key:"piece_id",label:"Piece ID",type:"text",placeholder:"2523/3"},
            {key:"stage",label:"Stage",type:"select",options:["Cutting","Grinding","Handling","Tempering-Transit","Loading","Site"]},
            {key:"cause",label:"Cause",type:"select",options:["BR-01 Operator","BR-02 Machine","BR-03 Handling","BR-04 Raw Material","BR-05 Thermal Shock"]},
            {key:"action",label:"Action",type:"select",options:["Dispose","Reproduce","Vendor-Claim"]},
            {key:"value",label:"Estimated Value PKR",type:"number",placeholder:"4500"},
          ],
          fields:(v)=>[{name:"NCR ID",value:"NCR-YYYYMMDD-XXXX",desc:"Auto"},{name:"Piece Status",value:"Broken",desc:"Immediate"}],
          gl:(v)=>v.action==="Dispose"?{docType:"JV",status:"Posted",id:"NCR-WO-XXXX",
            entries:[
              {side:"Dr",code:"56113",name:"Glass Breakage (write-off)",amount:fmt(n(v.value))},
              {side:"Cr",code:"11511",name:"Inventory",amount:fmt(n(v.value))},
            ],
            note:"Inventory written off as production loss."
          }:null,
          checks:["NCR ID generated","Piece → Broken","Action triggered correctly"],
        },
      ]
    },
  ],
  HR: [
    { id:"GT-HR01", name:"Attendance → Payroll → GL", desc:"Hazri se net salary tak — complete payroll cycle",
      phases:[
        { id:"p1", title:"Employee Salary Verify", module:"HR", icon:"PA20", tcode:"PA20",
          trigger:"Confirm employee exists with salary components", table:"employees",
          inputs:[
            {key:"emp_name",label:"Employee Name",type:"text",placeholder:"Ahmed Khan"},
            {key:"basic",label:"Basic Salary",type:"number",placeholder:"28000"},
            {key:"hr",label:"House Rent",type:"number",placeholder:"5000"},
            {key:"conv",label:"Conveyance",type:"number",placeholder:"1500"},
            {key:"special",label:"Special Allowance",type:"number",placeholder:"500"},
            {key:"eobi",label:"EOBI Registered?",type:"select",options:["Yes","No"]},
          ],
          fields:(v)=>{const gross=n(v.basic)+n(v.hr)+n(v.conv)+n(v.special);return[
            {name:"Gross",value:`PKR ${fmt(gross)}`,desc:"basic+HR+conv+special"},
            {name:"Day Rate",value:`PKR ${fmt(Math.round(gross/25))}`,desc:"gross ÷ 25"},
          ];},
          gl:null, checks:["Employee exists","status ≠ terminated","gross calculated correctly"],
        },
        { id:"p2", title:"Monthly Attendance", module:"HR", icon:"PA61", tcode:"PA61",
          trigger:"Mark attendance and calculate deductions", table:"attendance",
          inputs:[
            {key:"present",label:"Present Days",type:"number",placeholder:"20"},
            {key:"absent",label:"Absent Days",type:"number",placeholder:"3"},
            {key:"allowed_absent",label:"Allowed Absent",type:"number",placeholder:"1"},
            {key:"lates",label:"Late Count",type:"number",placeholder:"4"},
            {key:"ot_hrs",label:"OT Hours",type:"number",placeholder:"8"},
          ],
          fields:(v)=>{
            const gross=n(v.basic)+n(v.hr)+n(v.conv)+n(v.special);
            const dr=Math.round(gross/25); const hr8=dr/8;
            const absDed=(n(v.absent)-n(v.allowed_absent))*dr;
            const lateDed=Math.floor(n(v.lates)/3)*dr;
            const otPay=Math.round(n(v.ot_hrs)*hr8*1.5);
            return [
              {name:"Absent Deduction",value:`PKR ${fmt(Math.max(0,absDed))}`,desc:`(${v.absent}-${v.allowed_absent}) × ${dr}`},
              {name:"Late Deduction",value:`PKR ${fmt(lateDed)}`,desc:`floor(${v.lates}/3) × ${dr}`},
              {name:"OT Pay",value:`PKR ${fmt(otPay)}`,desc:`${v.ot_hrs} × ${(hr8).toFixed(0)} × 1.5`},
            ];
          },
          gl:null, checks:["Sandwich Sunday rule applied","Present+Absent = working days"],
        },
        { id:"p3", title:"Payroll Calculation & Net Salary", module:"HR", icon:"PC00", tcode:"PC00",
          trigger:"Calculate net salary with all deductions", table:"payroll",
          inputs:[
            {key:"loan_ded",label:"Loan Deduction PKR",type:"number",placeholder:"2000"},
          ],
          fields:(v)=>{
            const gross=n(v.basic)+n(v.hr)+n(v.conv)+n(v.special);
            const dr=Math.round(gross/25); const hr8=dr/8;
            const absDed=Math.max(0,(n(v.absent)-n(v.allowed_absent))*dr);
            const lateDed=Math.floor(n(v.lates)/3)*dr;
            const otPay=Math.round(n(v.ot_hrs)*hr8*1.5);
            const eobi=v.eobi==="Yes"?370:0;
            const beforeLoan=Math.max(0,gross-absDed-lateDed-eobi);
            const loanCap=Math.round(beforeLoan*0.5);
            const actualLoan=Math.min(n(v.loan_ded),loanCap);
            const net=Math.max(0,gross+otPay-absDed-lateDed-actualLoan-eobi);
            return [
              {name:"Gross",value:`PKR ${fmt(gross)}`,desc:"Total earnings"},
              {name:"+ OT",value:`PKR ${fmt(otPay)}`,desc:"Overtime pay"},
              {name:"- Absent",value:`PKR ${fmt(absDed)}`,desc:"Absent deduction"},
              {name:"- Late",value:`PKR ${fmt(lateDed)}`,desc:"Late penalty"},
              {name:"- EOBI",value:`PKR ${fmt(eobi)}`,desc:v.eobi==="Yes"?"Registered":"N/A"},
              {name:"- Loan",value:`PKR ${fmt(actualLoan)}`,desc:`Cap: 50% of ${fmt(beforeLoan)} = ${fmt(loanCap)}`},
              {name:"NET SALARY",value:`PKR ${fmt(net)}`,desc:"Final payable"},
            ];
          },
          gl:(v)=>{
            const gross=n(v.basic)+n(v.hr)+n(v.conv)+n(v.special);
            const dr=Math.round(gross/25);const hr8=dr/8;
            const absDed=Math.max(0,(n(v.absent)-n(v.allowed_absent))*dr);
            const lateDed=Math.floor(n(v.lates)/3)*dr;
            const otPay=Math.round(n(v.ot_hrs)*hr8*1.5);
            const eobi=v.eobi==="Yes"?370:0;
            const beforeLoan=Math.max(0,gross-absDed-lateDed-eobi);
            const actualLoan=Math.min(n(v.loan_ded),Math.round(beforeLoan*0.5));
            const net=Math.max(0,gross+otPay-absDed-lateDed-actualLoan-eobi);
            return {docType:"JV",status:"Posted",id:"PAY-JV-MMYY",
              entries:[
                {side:"Dr",code:"5211",name:"Salaries & Wages",amount:fmt(n(v.basic))},
                {side:"Dr",code:"5212",name:"Allowances",amount:fmt(n(v.hr)+n(v.conv)+n(v.special))},
                {side:"Dr",code:"5213",name:"Overtime",amount:fmt(otPay)},
                {side:"Cr",code:"2211",name:"Salaries Payable",amount:fmt(net)},
                {side:"Cr",code:"1121",name:"Staff Loans (Recovery)",amount:fmt(actualLoan)},
              ],
              note:`Net PKR ${fmt(net)} payable. Loan recovery PKR ${fmt(actualLoan)} credited to asset.`
            };
          },
          checks:["dayRate = gross/25","50% loan cap enforced","EOBI = 370 if registered","Dr = Cr"],
        },
      ]
    },
    { id:"GT-HR02", name:"Loan Requisition → Recovery", desc:"Loan request se monthly deduction tak — full cycle",
      phases:[
        { id:"p1", title:"Submit Loan Requisition", module:"STORE", icon:"ME51N", tcode:"ME51N",
          trigger:"Employee requests loan through requisition", table:"requisitions",
          inputs:[
            {key:"emp_name",label:"Employee",type:"text",placeholder:"Ahmed Khan"},
            {key:"amount",label:"Loan Amount PKR",type:"number",placeholder:"50000"},
            {key:"installments",label:"Monthly Installment",type:"number",placeholder:"5000"},
          ],
          fields:(v)=>[{name:"Months",value:`${Math.ceil(n(v.amount)/Math.max(1,n(v.installments)))}`,desc:"Repayment period"},{name:"Status",value:"Pending",desc:"Awaiting approval"}],
          gl:null, checks:["REQ ID generated","category = HR","subCategory = Loan Request"],
        },
        { id:"p2", title:"Approve & Issue Loan", module:"HR", icon:"PA30", tcode:"PA30",
          trigger:"MD approves, HR issues loan with GL entry", table:"loans + ledger",
          inputs:[{key:"approved_by",label:"Approved By",type:"text",placeholder:"Pervez Akhtar"}],
          fields:(v)=>[{name:"Loan Status",value:"Active",desc:"Repayment begins"},{name:"REQ Status",value:"Completed",desc:"Linked"}],
          gl:(v)=>({docType:"JV",status:"Posted",id:"LOAN-DISB-XXXX",
            entries:[
              {side:"Dr",code:"1121",name:"Staff Loans & Advances",amount:fmt(n(v.amount))},
              {side:"Cr",code:"1111",name:"Cash in Hand",amount:fmt(n(v.amount))},
            ],
            note:`PKR ${fmt(n(v.amount))} disbursed. Asset created in 1121.`
          }),
          checks:["Loan status = Active","REQ → Completed","GL: Dr 1121 / Cr 1111"],
        },
      ]
    },
    { id:"GT-HR03", name:"Leave Application → Approval", desc:"Leave apply, manager approve, auto-attendance",
      phases:[
        { id:"p1", title:"Apply for Leave", module:"HR", icon:"PA61", tcode:"PA61",
          trigger:"Employee submits leave application", table:"leave_applications",
          inputs:[
            {key:"type",label:"Leave Type",type:"select",options:["Annual (16d)","Casual (10d)","Sick (8d)","Unpaid"]},
            {key:"days",label:"Days",type:"number",placeholder:"3"},
          ],
          fields:(v)=>[{name:"Status",value:"Pending",desc:"Awaiting manager"},{name:"Days",value:v.days||"—",desc:"Excluding Sundays"}],
          gl:null, checks:["Leave record created","balance check: remaining >= requested"],
        },
        { id:"p2", title:"Manager Approves → Auto Attendance", module:"HR", icon:"PA30", tcode:"PA30",
          trigger:"Approval creates attendance records automatically", table:"attendance",
          inputs:[{key:"action",label:"Action",type:"select",options:["Approve","Reject"]}],
          fields:(v)=>[{name:"Attendance",value:`${v.days||0} records created`,desc:"Sundays excluded"},{name:"Status",value:v.action||"Pending",desc:"Leave status"}],
          gl:null, checks:["status → Approved","Auto attendance (Absent) for each leave day","Sundays excluded"],
        },
      ]
    },
    { id:"GT-HR04", name:"Salary Disbursement", desc:"Mark salary paid — clear Salaries Payable liability",
      phases:[
        { id:"p1", title:"Mark Salary Paid", module:"FINANCE", icon:"F110", tcode:"F110",
          trigger:"HR marks employee salary as disbursed", table:"payroll + ledger",
          inputs:[
            {key:"emp_name",label:"Employee",type:"text",placeholder:"Ahmed Khan"},
            {key:"net_salary",label:"Net Salary PKR",type:"number",placeholder:"30530"},
          ],
          fields:(v)=>[{name:"Paid",value:`PKR ${fmt(n(v.net_salary))}`,desc:"Cash disbursed"},{name:"Flag",value:"isSalaryPaid = true",desc:"Payroll updated"}],
          gl:(v)=>({docType:"JV",status:"Posted",id:"PAY-DISB-salary-XXXX",
            entries:[
              {side:"Dr",code:"2211",name:"Salaries Payable",amount:fmt(n(v.net_salary))},
              {side:"Cr",code:"1111",name:"Cash in Hand",amount:fmt(n(v.net_salary))},
            ],
            note:"Liability cleared, cash paid to employee."
          }),
          checks:["isSalaryPaid = true","Dr 2211 / Cr 1111","Amount matches net salary"],
        },
      ]
    },
  ],
  FINANCE: [
    { id:"GT-FI01", name:"Journal Voucher — Maker-Checker", desc:"Draft by Maker → Approve by Checker (4-eyes)",
      phases:[
        { id:"p1", title:"Maker Creates Draft JV", module:"FINANCE", icon:"FB50", tcode:"FB50",
          trigger:"Accountant creates draft journal voucher", table:"ledger",
          inputs:[
            {key:"dr_code",label:"Debit GL Code",type:"text",placeholder:"51214"},
            {key:"dr_name",label:"Debit Account",type:"text",placeholder:"Freight Expense"},
            {key:"cr_code",label:"Credit GL Code",type:"text",placeholder:"11112"},
            {key:"cr_name",label:"Credit Account",type:"text",placeholder:"Cash in Hand"},
            {key:"amount",label:"Amount PKR",type:"number",placeholder:"25000"},
            {key:"maker",label:"Maker Email",type:"text",placeholder:"accountant@glasstech.pk"},
          ],
          fields:(v)=>[{name:"Doc Type",value:"JV",desc:"Manual journal"},{name:"Status",value:"Draft",desc:"Awaiting checker"}],
          gl:(v)=>({docType:"JV",status:"Draft",id:"JV-DRAFT-XXXX",
            entries:[
              {side:"Dr",code:v.dr_code||"51214",name:v.dr_name||"Expense",amount:fmt(n(v.amount))},
              {side:"Cr",code:v.cr_code||"11112",name:v.cr_name||"Cash",amount:fmt(n(v.amount))},
            ],
            note:"Draft — NOT in Trial Balance yet. Needs checker approval."
          }),
          checks:["docType = JV","status = Draft","draftedBy = maker email","Period must be Open"],
        },
        { id:"p2", title:"Checker Approves (4-Eyes)", module:"FINANCE", icon:"FBV2", tcode:"FBV2",
          trigger:"Different person approves — cannot be same as maker", table:"ledger",
          inputs:[
            {key:"checker",label:"Checker Email",type:"text",placeholder:"cfo@glasstech.pk"},
          ],
          fields:(v)=>[
            {name:"4-Eyes Check",value:v.maker!==v.checker?"PASS":"VIOLATION",desc:`${v.maker} ≠ ${v.checker}`},
            {name:"Status",value:"Posted",desc:"GL now live"},
          ],
          gl:(v)=>({docType:"JV",status:"Posted",id:"JV-POSTED-XXXX",
            entries:[
              {side:"Dr",code:v.dr_code||"51214",name:v.dr_name||"Expense",amount:fmt(n(v.amount))},
              {side:"Cr",code:v.cr_code||"11112",name:v.cr_name||"Cash",amount:fmt(n(v.amount))},
            ],
            note:"Posted — now in Trial Balance. Approved by checker."
          }),
          checks:["approver ≠ draftedBy (4-eyes)","GL balance: Dr = Cr","Period still Open","Status → Posted"],
        },
      ]
    },
    { id:"GT-FI02", name:"Payment Voucher (PV)", desc:"Parked PV → Finance approves → Posted",
      phases:[
        { id:"p1", title:"Create Parked PV", module:"FINANCE", icon:"FV60", tcode:"FV60",
          trigger:"Create payment voucher for expense", table:"ledger",
          inputs:[
            {key:"category",label:"Category",type:"select",options:["BOM Hardware","Consumables","General Expense","Vehicle Fuel","R&M"]},
            {key:"amount",label:"Amount PKR",type:"number",placeholder:"45000"},
            {key:"mode",label:"Payment Mode",type:"select",options:["Cash","Petty Cash","Bank Transfer"]},
          ],
          fields:(v)=>[{name:"PV ID",value:"GT-PV-GLS-MMYY-XXXX",desc:"Auto seq"},{name:"Status",value:"Parked",desc:"Needs finance approval"}],
          gl:(v)=>({docType:"PV",status:"Parked",id:"GT-PV-GLS-MMYY-XXXX",
            entries:[
              {side:"Dr",code:"11421",name:`${v.category||"Expense"}`,amount:fmt(n(v.amount))},
              {side:"Cr",code:v.mode==="Cash"?"11112":v.mode==="Petty Cash"?"11111":"11121",name:v.mode||"Cash",amount:fmt(n(v.amount))},
            ],
            note:"Parked — GL not effective until finance posts."
          }),
          checks:["doc_type = PV","status = Parked","reqId linked"],
        },
      ]
    },
    { id:"GT-FI03", name:"Petty Cash Entry (CJ)", desc:"Cash receipt or payment with business transaction codes",
      phases:[
        { id:"p1", title:"Post Petty Cash Entry", module:"FINANCE", icon:"FBCJ", tcode:"FBCJ",
          trigger:"Record cash receipt or payment", table:"petty_cash + ledger",
          inputs:[
            {key:"type",label:"Type",type:"select",options:["Receipt","Payment"]},
            {key:"amount",label:"Amount PKR",type:"number",placeholder:"5000"},
            {key:"biz_trans",label:"Business Transaction",type:"select",options:["A10 Supplies","A20 R&M","A30 Consumables","A40 Fuel","E10 Cash from Bank"]},
            {key:"gl_account",label:"Offsetting GL",type:"text",placeholder:"53211"},
          ],
          fields:(v)=>[{name:"Doc Type",value:"CJ",desc:"Cash Journal"},{name:"Status",value:"Posted",desc:"Direct post"}],
          gl:(v)=>{
            const isReceipt = v.type==="Receipt";
            return {docType:"CJ",status:"Posted",id:"CJ-XXXXXX",
              entries:[
                {side:"Dr",code:isReceipt?"12320":v.gl_account||"53211",name:isReceipt?"Petty Cash":v.biz_trans||"Expense",amount:fmt(n(v.amount))},
                {side:"Cr",code:isReceipt?v.gl_account||"53211":"12320",name:isReceipt?v.biz_trans||"Source":"Petty Cash",amount:fmt(n(v.amount))},
              ],
              note:isReceipt?"Cash received into petty cash float.":"Petty cash spent on expense."
            };
          },
          checks:["doc_type = CJ","status = Posted","costCenterId attached to debit"],
        },
      ]
    },
    { id:"GT-FI04", name:"Bank Reconciliation", desc:"Import statement, match GL, identify differences",
      phases:[
        { id:"p1", title:"Start Recon Session", module:"FINANCE", icon:"FF67", tcode:"FF67",
          trigger:"Start bank reconciliation for month", table:"bank_recon_sessions",
          inputs:[
            {key:"bank",label:"Bank",type:"select",options:["HBL","Meezan","MCB"]},
            {key:"month",label:"Month",type:"text",placeholder:"2026-04"},
            {key:"bank_bal",label:"Bank Statement Balance PKR",type:"number",placeholder:"2500000"},
            {key:"gl_bal",label:"GL Balance PKR",type:"number",placeholder:"2480000"},
          ],
          fields:(v)=>[
            {name:"Difference",value:`PKR ${fmt(Math.abs(n(v.bank_bal)-n(v.gl_bal)))}`,desc:n(v.bank_bal)===n(v.gl_bal)?"Balanced":"Needs matching"},
            {name:"Status",value:Math.abs(n(v.bank_bal)-n(v.gl_bal))<1?"Balanced":"In Progress",desc:"Reconciliation status"},
          ],
          gl:null, checks:["Session created in Supabase","GL entries loaded for bank+month","difference calculated"],
        },
      ]
    },
    { id:"GT-FI05", name:"Period Open / Close", desc:"Fiscal period management — hard block on GL when closed",
      phases:[
        { id:"p1", title:"Open/Close Fiscal Period", module:"FINANCE", icon:"OB52", tcode:"OB52",
          trigger:"Open or close a fiscal period", table:"fiscal_periods",
          inputs:[
            {key:"month",label:"Month",type:"text",placeholder:"2026-04"},
            {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]},
            {key:"action",label:"Action",type:"select",options:["Open","Close"]},
          ],
          fields:(v)=>[{name:"Period",value:v.month||"—",desc:v.company||""},{name:"New Status",value:v.action||"—",desc:v.action==="Close"?"All GL writes BLOCKED":"GL writes allowed"}],
          gl:null, checks:["Period status updated","If Closed: all GL posts blocked","No agent bypass","audit_log entry on violation attempt"],
        },
      ]
    },
  ],
  MASTERS: [
    { id:"GT-MS01", name:"Client Master Create", desc:"New client with credit limit",
      phases:[
        { id:"p1", title:"Create Client", module:"MASTERS", icon:"XD01", tcode:"XD01",
          trigger:"Create new business partner", table:"clients",
          inputs:[
            {key:"name",label:"Client Name",type:"text",placeholder:"Gulshan Towers Pvt Ltd"},
            {key:"phone",label:"Phone",type:"text",placeholder:"0321-2345678"},
            {key:"ntn",label:"NTN",type:"text",placeholder:"1234567-8"},
            {key:"credit",label:"Credit Limit PKR",type:"number",placeholder:"500000"},
          ],
          fields:(v)=>[{name:"ID",value:"BP-XXXXXX",desc:"Auto timestamp"},{name:"Status",value:"Active",desc:"Default"}],
          gl:null, checks:["BP-XXXXXX ID generated","status = Active","phone format valid"],
        },
      ]
    },
    { id:"GT-MS02", name:"Vendor Master + Rate Card", desc:"Vendor with type and glass rates",
      phases:[
        { id:"p1", title:"Create Vendor", module:"MASTERS", icon:"XK01", tcode:"XK01",
          trigger:"Register new vendor", table:"vendors",
          inputs:[
            {key:"name",label:"Vendor Name",type:"text",placeholder:"Ghani Glass"},
            {key:"type",label:"Type",type:"select",options:["Glass","Tempering","Transport","Hardware","Profile","Labour"]},
            {key:"phone",label:"Phone",type:"text",placeholder:"0300-1234567"},
          ],
          fields:(v)=>[{name:"Vendor",value:v.name||"—",desc:v.type||""},{name:"Status",value:"Active",desc:"Default"}],
          gl:null, checks:["Vendor created","type assigned","status = Active"],
        },
      ]
    },
    { id:"GT-MS03", name:"Employee Master + Salary", desc:"New employee with salary components",
      phases:[
        { id:"p1", title:"Create Employee", module:"MASTERS", icon:"PA01", tcode:"PA01",
          trigger:"Register new employee", table:"employees",
          inputs:[
            {key:"name",label:"Name",type:"text",placeholder:"Ahmed Khan"},
            {key:"dept",label:"Department",type:"text",placeholder:"Production"},
            {key:"basic",label:"Basic Salary",type:"number",placeholder:"28000"},
          ],
          fields:(v)=>[{name:"Code",value:"Glassco-XXX",desc:"Auto"},{name:"Status",value:"probation",desc:"Default"}],
          gl:null, checks:["Employee created","employeeCode auto-generated","L5 GL account auto-created"],
        },
      ]
    },
    { id:"GT-MS04", name:"Cost Center (KS01)", desc:"Create cost center with budget",
      phases:[
        { id:"p1", title:"Create Cost Center", module:"MASTERS", icon:"KS01", tcode:"KS01",
          trigger:"Create cost center for department", table:"cost_centers",
          inputs:[
            {key:"code",label:"CC Code",type:"text",placeholder:"1001"},
            {key:"name",label:"Name",type:"text",placeholder:"CUTTING SECTION"},
            {key:"dept",label:"Department",type:"text",placeholder:"Production"},
            {key:"budget",label:"Monthly Budget PKR",type:"number",placeholder:"200000"},
            {key:"category",label:"Category",type:"select",options:["F (Production)","H (Auxiliary)","W (Admin)","V (Sales)","L (Logistics)"]},
          ],
          fields:(v)=>[{name:"ID",value:`Glassco-CC-${v.code||"XXXX"}`,desc:"Auto"},{name:"Alert",value:"80%",desc:"Budget threshold"}],
          gl:null, checks:["ID format correct","name UPPERCASE","budgetMonthly > 0","category assigned"],
        },
      ]
    },
  ],
};

// Flatten for easy lookup
const ALL_TESTS = Object.entries(GUIDED_TESTS).flatMap(([mod, tests]) =>
  tests.map(t => ({ ...t, module: mod }))
);

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function GLBox({ gl }) {
  if (!gl) return null;
  return (
    <div style={{ marginTop:10, padding:"10px 12px", borderRadius:8, background:"#0A1628", border:"1px solid #2C3E5066" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:9, fontWeight:700, color:"#5DADE2", letterSpacing:1 }}>GL POSTING</span>
        <div style={{ display:"flex", gap:6 }}>
          <span style={{ fontSize:8, padding:"2px 6px", borderRadius:8, background:gl.status==="Posted"?"#27AE6033":"#F39C1233", color:gl.status==="Posted"?"#27AE60":"#F39C12", fontWeight:700 }}>{gl.status}</span>
          <span style={{ fontSize:8, padding:"2px 6px", borderRadius:8, background:"#2980B933", color:"#2980B9", fontWeight:700 }}>{gl.docType}</span>
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead><tr>
          {["","Code","Account","PKR"].map(h=><th key={h} style={{ fontSize:8, color:"#667788", textAlign:h==="PKR"?"right":"left", padding:"2px 4px", borderBottom:"1px solid #2C3E50" }}>{h}</th>)}
        </tr></thead>
        <tbody>{gl.entries.map((e,i)=>(
          <tr key={i}>
            <td style={{ fontSize:10, padding:"4px", fontWeight:700, color:e.side==="Dr"?"#E74C3C":"#27AE60" }}>{e.side}</td>
            <td style={{ fontSize:10, padding:"4px", color:"#AABBCC", fontFamily:"monospace" }}>{e.code}</td>
            <td style={{ fontSize:10, padding:"4px", color:"#E0E0E0" }}>{e.name}</td>
            <td style={{ fontSize:10, padding:"4px", color:"#E0E0E0", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{e.amount}</td>
          </tr>
        ))}</tbody>
      </table>
      {gl.note && <div style={{ fontSize:8, color:"#F39C12", marginTop:6, fontStyle:"italic" }}>{gl.note}</div>}
    </div>
  );
}

function FlowArrow({ amount, fromMod, toMod }) {
  const c1 = MOD[fromMod]?.color || "#2C3E50";
  const c2 = MOD[toMod]?.color || c1;
  const cross = fromMod !== toMod;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"2px 0", position:"relative" }}>
      <div style={{ width:3, height:cross?36:20, background:`linear-gradient(${c1},${c2})`, borderRadius:2 }} />
      <div style={{ width:0, height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`8px solid ${c2}` }} />
      {amount && <div style={{ position:"absolute", left:24, top:"50%", transform:"translateY(-50%)", fontSize:9, color:"#27AE60", fontWeight:700, fontFamily:"monospace", background:"#27AE6018", padding:"2px 8px", borderRadius:6, whiteSpace:"nowrap" }}>PKR {amount}</div>}
      {cross && <div style={{ position:"absolute", right:24, top:"50%", transform:"translateY(-50%)", fontSize:7, color:"#F39C12", fontWeight:700, background:"#F39C1218", padding:"2px 6px", borderRadius:6, letterSpacing:1 }}>HANDOFF</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function GuidedTestFlows() {
  const [activeTest, setActiveTest] = useState(null);
  const [activePhase, setActivePhase] = useState(0);
  const [values, setValues] = useState({});
  const [completedPhases, setCompletedPhases] = useState({});
  const [expandedMod, setExpandedMod] = useState("STORE");

  // Load saved sessions from localStorage
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("gtk_guided_tests")||"{}"); if (saved) setValues(saved); } catch{}
  }, []);

  // Save on change
  useEffect(() => {
    if (Object.keys(values).length > 0) localStorage.setItem("gtk_guided_tests", JSON.stringify(values));
  }, [values]);

  const test = activeTest ? ALL_TESTS.find(t => t.id === activeTest) : null;

  // Merged values across all phases of active test (so phase 3 can see phase 1 inputs)
  const mergedValues = useMemo(() => {
    if (!test) return {};
    const merged = {};
    test.phases.forEach(p => {
      const pv = values[test.id]?.[p.id] || {};
      Object.assign(merged, pv);
    });
    return merged;
  }, [test, values]);

  const setVal = useCallback((testId, phaseId, key, val) => {
    setValues(prev => ({
      ...prev,
      [testId]: { ...prev[testId], [phaseId]: { ...prev[testId]?.[phaseId], [key]: val } }
    }));
  }, []);

  const completePhase = useCallback((testId, phaseId, idx) => {
    setCompletedPhases(prev => ({ ...prev, [`${testId}-${phaseId}`]: true }));
    if (test && idx < test.phases.length - 1) setActivePhase(idx + 1);
  }, [test]);

  const resetTest = useCallback(() => {
    if (!test) return;
    setValues(prev => { const nv = { ...prev }; delete nv[test.id]; return nv; });
    setCompletedPhases(prev => {
      const nc = { ...prev };
      test.phases.forEach(p => delete nc[`${test.id}-${p.id}`]);
      return nc;
    });
    setActivePhase(0);
  }, [test]);

  const selectTest = (id) => { setActiveTest(id); setActivePhase(0); };

  // Compute flow amounts for connectors
  const getFlowAmount = (phaseIdx) => {
    if (!test || phaseIdx < 1) return null;
    const prev = test.phases[phaseIdx - 1];
    const glFn = prev.gl;
    if (!glFn || typeof glFn !== "function") return null;
    const gl = glFn(mergedValues);
    if (!gl?.entries?.length) return null;
    return gl.entries[0]?.amount;
  };

  return (
    <div style={{ fontFamily:"'Segoe UI',Calibri,sans-serif", background:"#0D1B2A", minHeight:"100vh", color:"#E0E0E0" }}>
      {/* Header */}
      <div style={{ background:"#1B2B3A", padding:"14px 24px", borderBottom:"2px solid #2C3E50" }}>
        <div style={{ fontSize:18, fontWeight:700, color:"white" }}>GlassTech ERP — Guided Test Flows</div>
        <div style={{ fontSize:10, color:"#667788", marginTop:2 }}>
          {ALL_TESTS.length} Tests | 5 Modules | Interactive Input Collection | Live GL Entries | SAP T-Codes
        </div>
      </div>

      <div style={{ display:"flex", height:"calc(100vh - 56px)" }}>
        {/* ── Left: Module Accordion + Test List ──────────────────────── */}
        <div style={{ width:300, background:"#1B2B3A", borderRight:"1px solid #2C3E50", overflowY:"auto", padding:12, flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#667788", letterSpacing:1, marginBottom:10 }}>SELECT A TEST</div>
          {Object.entries(GUIDED_TESTS).map(([mod, tests]) => {
            const mc = MOD[mod];
            const isOpen = expandedMod === mod;
            return (
              <div key={mod} style={{ marginBottom:6 }}>
                <div
                  onClick={() => setExpandedMod(isOpen ? null : mod)}
                  style={{
                    padding:"10px 12px", borderRadius:10, cursor:"pointer",
                    background: isOpen ? mc.bg : "#2C3E50",
                    border:`1.5px solid ${isOpen ? mc.color : "#3C4E5E"}`,
                    display:"flex", justifyContent:"space-between", alignItems:"center"
                  }}
                >
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ width:28, height:28, borderRadius:6, background:mc.color+"33", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:mc.color, fontFamily:"monospace" }}>{mc.icon}</div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#E0E0E0" }}>{mc.label}</div>
                      <div style={{ fontSize:9, color:"#667788" }}>{tests.length} tests</div>
                    </div>
                  </div>
                  <span style={{ fontSize:12, color:"#667788", transform:isOpen?"rotate(180deg)":"none", transition:"0.2s" }}>V</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop:4, marginLeft:8 }}>
                    {tests.map(t => {
                      const isActive = activeTest === t.id;
                      const done = t.phases.every(p => completedPhases[`${t.id}-${p.id}`]);
                      return (
                        <div key={t.id} onClick={() => selectTest(t.id)} style={{
                          padding:"8px 10px", borderRadius:8, marginBottom:3, cursor:"pointer",
                          background:isActive ? mc.color+"22" : "#0D1B2A",
                          border:`1px solid ${isActive ? mc.color : "#2C3E5044"}`,
                        }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:10, fontWeight:600, color:isActive?mc.color:"#AABBCC" }}>{t.name}</span>
                            {done && <span style={{ fontSize:8, color:"#27AE60", fontWeight:700 }}>DONE</span>}
                          </div>
                          <div style={{ fontSize:8, color:"#667788", marginTop:2 }}>{t.phases.length} phases</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Center: Flow Chart with Inputs ──────────────────────────── */}
        <div style={{ flex:1, overflowY:"auto", padding:24 }}>
          {!test ? (
            <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#667788" }}>
              <div style={{ fontSize:40, marginBottom:12, opacity:0.3 }}>{"{ }"}</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#8899AA", marginBottom:6 }}>Kya test karna hai?</div>
              <div style={{ fontSize:11, textAlign:"center", maxWidth:400, lineHeight:1.6 }}>
                Left panel se module choose karo, phir test select karo. Har test mein step-by-step inputs hain — values dalo, GL entries live dikhein gi apki amounts ke saath.
              </div>
              <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap", justifyContent:"center" }}>
                {Object.entries(MOD).map(([k,v])=>(
                  <div key={k} style={{ padding:"8px 14px", borderRadius:8, background:v.bg, border:`1px solid ${v.color}44`, textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:v.color }}>{GUIDED_TESTS[k].length}</div>
                    <div style={{ fontSize:8, color:v.color, fontWeight:700 }}>{v.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Test Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                <div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:9, padding:"3px 8px", borderRadius:8, background:MOD[test.module].color+"33", color:MOD[test.module].color, fontWeight:700 }}>{MOD[test.module].label}</span>
                    <span style={{ fontSize:9, color:"#667788" }}>{test.id}</span>
                  </div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#E0E0E0" }}>{test.name}</div>
                  <div style={{ fontSize:10, color:"#8899AA", marginTop:2 }}>{test.desc}</div>
                </div>
                <button onClick={resetTest} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #E74C3C44", background:"#2E0A0A", color:"#E74C3C", fontSize:10, fontWeight:700, cursor:"pointer" }}>Reset Test</button>
              </div>

              {/* Phase Cards */}
              {test.phases.map((phase, idx) => {
                const phaseValues = { ...mergedValues, ...(values[test.id]?.[phase.id] || {}) };
                const isActive = idx === activePhase;
                const isDone = completedPhases[`${test.id}-${phase.id}`];
                const mc = MOD[phase.module] || MOD.STORE;
                const fields = typeof phase.fields === "function" ? phase.fields(phaseValues) : (phase.fields || []);
                const gl = phase.gl && typeof phase.gl === "function" ? phase.gl(phaseValues) : phase.gl;
                const flowAmt = getFlowAmount(idx);

                return (
                  <div key={phase.id}>
                    {idx > 0 && <FlowArrow amount={flowAmt} fromMod={test.phases[idx-1].module} toMod={phase.module} />}
                    <div style={{
                      border:`2px solid ${isDone ? "#27AE60" : isActive ? mc.color : "#2C3E5066"}`,
                      borderRadius:14, background:isActive?mc.bg:"#1B2B3A", padding:"16px 20px",
                      cursor:"pointer", transition:"all 0.2s",
                      opacity: idx > activePhase && !isDone ? 0.4 : 1,
                    }}
                    onClick={() => { if (idx <= activePhase || isDone) setActivePhase(idx); }}
                    >
                      {/* Phase Header */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          <div style={{ width:36, height:36, borderRadius:8, background:isDone?"#27AE6033":mc.color+"22", border:`1.5px solid ${isDone?"#27AE60":mc.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:isDone?14:9, fontWeight:700, color:isDone?"#27AE60":mc.color, fontFamily:"monospace" }}>{isDone?"V":phase.icon}</div>
                          <div>
                            <div style={{ fontSize:9, color:mc.color, fontWeight:700, letterSpacing:1 }}>Phase {idx+1} | {mc.label} | T-Code: {phase.tcode}</div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#E0E0E0" }}>{phase.title}</div>
                            <div style={{ fontSize:10, color:"#8899AA" }}>{phase.trigger}</div>
                          </div>
                        </div>
                        <span style={{ fontSize:8, padding:"3px 8px", borderRadius:8, fontFamily:"monospace", background:"#0D1B2A", color:"#667788" }}>{phase.table}</span>
                      </div>

                      {/* Input Form (when active) */}
                      {isActive && !isDone && (
                        <div style={{ marginTop:14, borderTop:"1px solid #2C3E5044", paddingTop:14 }}>
                          <div style={{ fontSize:9, fontWeight:700, color:"#667788", letterSpacing:1, marginBottom:8 }}>ENTER TEST VALUES</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                            {phase.inputs.map(inp => (
                              <div key={inp.key}>
                                <div style={{ fontSize:9, fontWeight:700, color:"#8899AA", marginBottom:3 }}>{inp.label}</div>
                                {inp.type === "select" ? (
                                  <select value={phaseValues[inp.key]||""} onChange={e=>setVal(test.id,phase.id,inp.key,e.target.value)}
                                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`1px solid ${mc.color}66`, background:"#0D1B2A", color:"#E0E0E0", fontSize:11 }}>
                                    <option value="">-- select --</option>
                                    {('options' in inp && inp.options ? inp.options : []).map(o=><option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : (
                                  <input type={inp.type} value={phaseValues[inp.key]||""} placeholder={'placeholder' in inp ? inp.placeholder : undefined}
                                    onChange={e=>setVal(test.id,phase.id,inp.key,e.target.value)}
                                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`1px solid ${mc.color}66`, background:"#0D1B2A", color:"#E0E0E0", fontSize:11, boxSizing:"border-box" }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Computed Fields (always show if inputs exist) */}
                      {(isActive || isDone) && fields.length > 0 && (
                        <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
                          {fields.map((f,i)=>(
                            <div key={i} style={{ padding:"6px 8px", borderRadius:6, background:"#0D1B2A", border:"1px solid #2C3E5044" }}>
                              <div style={{ fontSize:8, color:"#667788" }}>{f.name}</div>
                              <div style={{ fontSize:11, color:"#E0E0E0", fontWeight:700, fontFamily:"monospace" }}>{f.value}</div>
                              {f.desc && <div style={{ fontSize:8, color:"#8899AA" }}>{f.desc}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* GL Entries */}
                      {(isActive || isDone) && gl && <GLBox gl={gl} />}

                      {/* Checks */}
                      {(isActive || isDone) && phase.checks && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:8, fontWeight:700, color:"#667788", marginBottom:4, letterSpacing:1 }}>CHECKS</div>
                          {phase.checks.map((c,i) => (
                            <div key={i} style={{ fontSize:9, color:isDone?"#27AE60":"#8899AA", marginBottom:2 }}>
                              {isDone?"V ":"- "}{c}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Next / Complete Button */}
                      {isActive && !isDone && (
                        <button onClick={e=>{e.stopPropagation();completePhase(test.id,phase.id,idx);}} style={{
                          marginTop:12, width:"100%", padding:"10px", borderRadius:8, border:"none",
                          background:mc.color, color:"white", fontSize:12, fontWeight:700, cursor:"pointer"
                        }}>
                          {idx < test.phases.length - 1 ? `NEXT: Phase ${idx+2}` : "COMPLETE TEST"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Completion Banner */}
              {test.phases.every(p => completedPhases[`${test.id}-${p.id}`]) && (
                <div style={{ marginTop:16, padding:"16px 20px", borderRadius:12, background:"#0A2E1A", border:"2px solid #27AE6044", textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#27AE60" }}>Test Complete — All {test.phases.length} Phases Done</div>
                  <div style={{ fontSize:10, color:"#8899AA", marginTop:4 }}>Values saved. Click Reset Test to run again with different inputs.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
