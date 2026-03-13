// Central re-export — import from here for backward compat
export type { COAAccount } from './coa.types';
export { GTK_COA } from './coa.gtk';
export { GTI_COA } from './coa.gti';
export { GLASSCO_COA } from './coa.glassco';
export { NIPPON_COA } from './coa.nippon';
export { FACTORY_COA } from './coa.factory';

import { GTK_COA } from './coa.gtk';
import { GTI_COA } from './coa.gti';
import { GLASSCO_COA } from './coa.glassco';
import { NIPPON_COA } from './coa.nippon';
import { FACTORY_COA } from './coa.factory';
import { COAAccount } from './coa.types';

export const COMPANY_COA: Record<string, COAAccount[]> = {
  GTK:     GTK_COA,
  GTI:     GTI_COA,
  Glassco: GLASSCO_COA,
  Nippon:  NIPPON_COA,
  Factory: FACTORY_COA,
};
