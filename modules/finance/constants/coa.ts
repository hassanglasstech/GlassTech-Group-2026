export interface COAAccount {
  code: string;
  name: string;
  level: number;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  children?: COAAccount[];
}

export const GTK_COA: COAAccount[] = [
  {
    code: '1',
    name: 'Assets',
    level: 1,
    type: 'Asset',
    children: [
      {
        code: '11',
        name: 'Current Assets',
        level: 2,
        type: 'Asset',
        children: [
          {
            code: '111',
            name: 'Cash & Equivalents',
            level: 3,
            type: 'Asset',
            children: [
              { code: '1111', name: 'Cash in Hand', level: 4, type: 'Asset', children: [{ code: '11111', name: 'Petty Cash', level: 5, type: 'Asset' }] },
            ]
          },
          {
            code: '113',
            name: 'Inventory',
            level: 3,
            type: 'Asset',
            children: [
              { code: '1131', name: 'Raw Materials', level: 4, type: 'Asset', children: [{ code: '11311', name: 'Glass Sheets', level: 5, type: 'Asset' }] },
            ]
          }
        ]
      }
    ]
  },
  {
    code: '4',
    name: 'Revenue',
    level: 1,
    type: 'Revenue',
    children: [
      {
        code: '41',
        name: 'Sales',
        level: 2,
        type: 'Revenue',
        children: [
          { code: '411', name: 'Glass Sales', level: 3, type: 'Revenue', children: [{ code: '4111', name: 'Local Sales', level: 4, type: 'Revenue', children: [{ code: '41111', name: 'Standard Glass', level: 5, type: 'Revenue' }] }] }
        ]
      }
    ]
  }
];

export const GLASSCO_COA: COAAccount[] = [
  {
    code: '1',
    name: 'Assets',
    level: 1,
    type: 'Asset',
    children: [
      {
        code: '12',
        name: 'Non-Current Assets',
        level: 2,
        type: 'Asset',
        children: [
          { code: '121', name: 'Property, Plant & Equipment', level: 3, type: 'Asset', children: [{ code: '1211', name: 'Machinery', level: 4, type: 'Asset', children: [{ code: '12111', name: 'Tempering Furnace', level: 5, type: 'Asset' }] }] }
        ]
      }
    ]
  },
  {
    code: '5',
    name: 'Expenses',
    level: 1,
    type: 'Expense',
    children: [
      {
        code: '51',
        name: 'Cost of Goods Sold',
        level: 2,
        type: 'Expense',
        children: [
          { code: '511', name: 'Direct Costs', level: 3, type: 'Expense', children: [{ code: '5111', name: 'Processing Costs', level: 4, type: 'Expense', children: [{ code: '51111', name: 'Tempering Energy', level: 5, type: 'Expense' }] }] }
        ]
      }
    ]
  }
];

export const FACTORY_COA: COAAccount[] = [
  {
    code: '5',
    name: 'Expenses',
    level: 1,
    type: 'Expense',
    children: [
      {
        code: '52',
        name: 'Operating Expenses',
        level: 2,
        type: 'Expense',
        children: [
          { code: '521', name: 'Repair & Maintenance', level: 3, type: 'Expense', children: [{ code: '5211', name: 'Factory Equipment', level: 4, type: 'Expense', children: [{ code: '52111', name: 'Preventive Maintenance', level: 5, type: 'Expense' }] }] },
          { code: '522', name: 'Purchases', level: 3, type: 'Expense', children: [{ code: '5221', name: 'Consumables', level: 4, type: 'Expense', children: [{ code: '52211', name: 'Lubricants & Oils', level: 5, type: 'Expense' }] }] }
        ]
      }
    ]
  }
];
