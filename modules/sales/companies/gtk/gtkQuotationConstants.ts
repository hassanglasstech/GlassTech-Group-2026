// ─── GTK ALUMINUM QUOTATION CONSTANTS ────────────────────────────────────────
// Rates extracted from actual GlassTech quotations (Sep 2025)

export const GTK_COMPANY_INFO = {
  name: 'GlassTech',
  tagline: 'Complete Architectural Glass Solution',
  address: '10 B, Seagul Appartments, BC 4/5, Block-5, Clifton, Karachi',
  phone: '+92-21-XXXXXXX',
  email: 'info@glasstech.pk',
};

// ─── PROFILE / SECTION SYSTEMS ───────────────────────────────────────────────

export type ProfileType = 'Non-Thermal' | 'Thermal Break' | 'AluWood OAK' | 'AluWood TEAK' | 'uPVC White' | 'uPVC Black Lami';

export const PROFILE_SYSTEMS: { id: ProfileType; label: string; sectionSizes: string[] }[] = [
  { id: 'Non-Thermal',    label: 'Non-Thermal (GT Gulf / P Series)',  sectionSizes: ['4"', '5"', '55mm'] },
  { id: 'Thermal Break',  label: 'Thermal Break (Imported)',           sectionSizes: ['55mm', '60mm', '70mm'] },
  { id: 'AluWood OAK',    label: 'AluWood — OAK Panel',               sectionSizes: ['55mm', '120mm'] },
  { id: 'AluWood TEAK',   label: 'AluWood — Burma Teak Panel',        sectionSizes: ['55mm', '120mm'] },
  { id: 'uPVC White',     label: 'uPVC — White',                      sectionSizes: ['55mm', '60mm', '70mm'] },
  { id: 'uPVC Black Lami',label: 'uPVC — Black Laminated',            sectionSizes: ['55mm', '60mm', '70mm'] },
];

export const SECTION_SIZES = ['4"', '5"', '55mm', '60mm', '70mm', '120mm'];

// ─── WINDOW TYPES ─────────────────────────────────────────────────────────────

export type WindowTypeId =
  | 'openable_1' | 'openable_2'
  | 'fixed_no_div' | 'fixed_div'
  | 'top_hung_1'
  | 'sliding_win_2' | 'sliding_win_1'
  | 'sliding_door_2' | 'sliding_door_4'
  | 'lift_slide' | 'lift_slide_fixed'
  | 'openable_door_1' | 'openable_door_2'
  | 'folding_4' | 'synchronized'
  | 'hanging_door' | 'pocket_sliding'
  | 'ms_door_single' | 'ms_door_double'
  | 'upvc_solid'
  | 'l_corner_fix' | 'l_corner_openable'
  | 'box_fix_frame' | 'curtain_wall';

export interface WindowType {
  id: WindowTypeId;
  label: string;
  shortLabel: string;
  category: 'window' | 'door' | 'special';
  pricingUnit: 'sqft' | 'rft';
  svgType: string;
}

export const WINDOW_TYPES: WindowType[] = [
  // Windows
  { id: 'openable_1',       label: 'Openable Window (1 Sash) Handle & Gear',   shortLabel: 'Openable 1S',    category: 'window',  pricingUnit: 'sqft', svgType: 'openable_1'    },
  { id: 'openable_2',       label: 'Openable Window (2 Sash) Handle & Gear',   shortLabel: 'Openable 2S',    category: 'window',  pricingUnit: 'sqft', svgType: 'openable_2'    },
  { id: 'fixed_no_div',     label: 'Fixed Frame (Without Divider)',              shortLabel: 'Fixed',          category: 'window',  pricingUnit: 'sqft', svgType: 'fixed_no_div'  },
  { id: 'fixed_div',        label: 'Fixed Frame (With Divider)',                 shortLabel: 'Fixed+Div',      category: 'window',  pricingUnit: 'sqft', svgType: 'fixed_div'     },
  { id: 'top_hung_1',       label: 'Top Hung Ventilator (1 Sash) Handle & Gear',shortLabel: 'Top Hung',       category: 'window',  pricingUnit: 'sqft', svgType: 'top_hung'      },
  { id: 'sliding_win_2',    label: 'Sliding Window (2 Sash) Handle & Gear',    shortLabel: 'Slide Win 2S',   category: 'window',  pricingUnit: 'sqft', svgType: 'sliding_2'     },
  { id: 'sliding_win_1',    label: 'Sliding Window (1 Sash) Handle & Gear',    shortLabel: 'Slide Win 1S',   category: 'window',  pricingUnit: 'sqft', svgType: 'sliding_1'     },
  { id: 'l_corner_fix',     label: 'L-Shape Corner Fixed Frame',                shortLabel: 'L-Corner Fix',   category: 'window',  pricingUnit: 'sqft', svgType: 'fixed_no_div'  },
  { id: 'l_corner_openable',label: 'L-Shape Corner Openable',                  shortLabel: 'L-Corner Open',  category: 'window',  pricingUnit: 'sqft', svgType: 'openable_1'    },
  // Doors
  { id: 'sliding_door_2',   label: 'Sliding Door (2 Sash) Handle & Gear',      shortLabel: 'Slide Door 2S',  category: 'door',    pricingUnit: 'sqft', svgType: 'sliding_2'     },
  { id: 'sliding_door_4',   label: 'Sliding Door (4 Sash) Handle & Gear',      shortLabel: 'Slide Door 4S',  category: 'door',    pricingUnit: 'sqft', svgType: 'sliding_4'     },
  { id: 'lift_slide',       label: 'Lift & Slide Door (Imported Series)',       shortLabel: 'Lift & Slide',   category: 'door',    pricingUnit: 'sqft', svgType: 'lift_slide'    },
  { id: 'lift_slide_fixed', label: 'Lift & Slide Door Fixed Panel',            shortLabel: 'L&S Fixed',      category: 'door',    pricingUnit: 'sqft', svgType: 'fixed_no_div'  },
  { id: 'openable_door_1',  label: 'Openable Door (1 Sash) Handle & Gear',     shortLabel: 'Open Door 1S',   category: 'door',    pricingUnit: 'sqft', svgType: 'casement_1'    },
  { id: 'openable_door_2',  label: 'Openable Door (2 Sash) Handle & Gear',     shortLabel: 'Open Door 2S',   category: 'door',    pricingUnit: 'sqft', svgType: 'casement_2'    },
  { id: 'folding_4',        label: 'Folding Door (4 Sash) 72mm KINLONG',       shortLabel: 'Folding 4S',     category: 'door',    pricingUnit: 'sqft', svgType: 'folding_4'     },
  { id: 'synchronized',     label: 'Synchronized Sliding Smart System (3+3)',   shortLabel: 'Sync Slide',     category: 'door',    pricingUnit: 'sqft', svgType: 'sync_slide'    },
  { id: 'hanging_door',     label: 'Hanging / Barn Sliding Door',               shortLabel: 'Hanging Door',   category: 'door',    pricingUnit: 'sqft', svgType: 'hanging'       },
  { id: 'pocket_sliding',   label: 'Pocket Sliding Door (Concealed)',           shortLabel: 'Pocket Slide',   category: 'door',    pricingUnit: 'sqft', svgType: 'pocket'        },
  { id: 'ms_door_single',   label: 'MS Door — Single Shutter',                 shortLabel: 'MS Single',      category: 'door',    pricingUnit: 'sqft', svgType: 'ms_door'       },
  { id: 'ms_door_double',   label: 'MS Door — Double Shutter',                 shortLabel: 'MS Double',      category: 'door',    pricingUnit: 'sqft', svgType: 'ms_door'       },
  { id: 'upvc_solid',       label: 'UPVC Solid Door (SKYPEN) Wood Texture',    shortLabel: 'UPVC Door',      category: 'door',    pricingUnit: 'sqft', svgType: 'upvc_solid'    },
  // Special
  { id: 'box_fix_frame',    label: 'Box Section Fix Frame / Door Frame',        shortLabel: 'Box Section',    category: 'special', pricingUnit: 'rft',  svgType: 'fixed_no_div'  },
  { id: 'curtain_wall',     label: 'Aluminium Curtain Wall Section',            shortLabel: 'Curtain Wall',   category: 'special', pricingUnit: 'sqft', svgType: 'fixed_no_div'  },
];

// ─── NETTING TYPES ────────────────────────────────────────────────────────────

export type NettingType = 'none' | 'zigzag' | 'hd_steel';

export const NETTING_TYPES = [
  { id: 'none'     as NettingType, label: 'No Netting'          },
  { id: 'zigzag'   as NettingType, label: 'Zig-Zag Netting'     },
  { id: 'hd_steel' as NettingType, label: 'HD Steel Mesh'       },
];

// ─── GLASS SPECS ──────────────────────────────────────────────────────────────

export const GLASS_SPECS = [
  { id: 'sg_5_clear',   label: '5mm Clear Tempered',            abbr: '5mm TG Clear'   },
  { id: 'sg_6_clear',   label: '6mm Clear Tempered',            abbr: '6mm TG Clear'   },
  { id: 'sg_6_frosted', label: '6mm Frosted Tempered',          abbr: '6mm TG Frosted' },
  { id: 'sg_8_clear',   label: '8mm Clear Tempered',            abbr: '8mm TG Clear'   },
  { id: 'sg_8_grey',    label: '8mm Grey Tempered',             abbr: '8mm TG Grey'    },
  { id: 'sg_10_clear',  label: '10mm Clear Tempered',           abbr: '10mm TG Clear'  },
  { id: 'sg_12_clear',  label: '12mm Clear Tempered',           abbr: '12mm TG Clear'  },
  { id: 'dg_24_clear',  label: '6+6 DG Clear (24mm spacer)',    abbr: 'DG Unit Clear'  },
  { id: 'dg_24_frosted',label: '6+6 DG Frosted (24mm spacer)',  abbr: 'DG Unit Frosted'},
  { id: 'lg_12_clear',  label: '6+0.76+6 LG Clear (12.76mm)',  abbr: '12.76mm LG Clear'},
  { id: 'lg_16_clear',  label: '8+0.76+8 LG Clear (16.76mm)',  abbr: '16.76mm LG Clear'},
  { id: 'custom',       label: 'Custom (Manual Entry)',          abbr: 'Custom'         },
];

// ─── RATE CARD — Rs./sqft (from actual quotations Sep 2025) ───────────────────
// Structure: rates[profileType][windowTypeId] = rate per sqft

export type RateCard = Record<string, Record<string, number>>;

export const DEFAULT_RATE_CARD: RateCard = {
  'Non-Thermal': {
    openable_1:       2350, openable_2:       2650,
    fixed_no_div:     1550, fixed_div:        1700,
    top_hung_1:       2350, sliding_win_2:    3050, sliding_win_1: 2350,
    sliding_door_2:   3050, sliding_door_4:   3150,
    lift_slide:       3850, lift_slide_fixed: 1550,
    openable_door_1:  3000, openable_door_2:  3200,
    folding_4:        4200, synchronized:     4500,
    hanging_door:     3500, pocket_sliding:   3800,
    ms_door_single:   2200, ms_door_double:   2400,
    upvc_solid:       2800,
    l_corner_fix:     1550, l_corner_openable:2350,
    box_fix_frame:     900, curtain_wall:     2800,
  },
  'Thermal Break': {
    openable_1:       4257, openable_2:       4584,
    fixed_no_div:     2022, fixed_div:        2300,
    top_hung_1:       4000, sliding_win_2:    5062, sliding_win_1: 4000,
    sliding_door_2:   5062, sliding_door_4:   5470,
    lift_slide:       6500, lift_slide_fixed: 2022,
    openable_door_1:  4500, openable_door_2:  4800,
    folding_4:        6200, synchronized:     7000,
    hanging_door:     5500, pocket_sliding:   5800,
    ms_door_single:   3500, ms_door_double:   3800,
    upvc_solid:       4000,
    l_corner_fix:     2022, l_corner_openable:4000,
    box_fix_frame:    1300, curtain_wall:     4500,
  },
  'AluWood OAK': {
    openable_1:       5527, openable_2:       5995,
    fixed_no_div:     2468, fixed_div:        2800,
    top_hung_1:       5000, sliding_win_2:    7144, sliding_win_1: 5500,
    sliding_door_2:   7144, sliding_door_4:   7571,
    lift_slide:       9500, lift_slide_fixed: 2468,
    openable_door_1:  6000, openable_door_2:  6500,
    folding_4:        8500, synchronized:     9800,
    hanging_door:     7000, pocket_sliding:   7500,
    ms_door_single:   4500, ms_door_double:   5000,
    upvc_solid:       5500,
    l_corner_fix:     2468, l_corner_openable:5200,
    box_fix_frame:    1800, curtain_wall:     6000,
  },
  'AluWood TEAK': {
    openable_1:       4545, openable_2:       4730,
    fixed_no_div:     2757, fixed_div:        3000,
    top_hung_1:       4200, sliding_win_2:    5131, sliding_win_1: 4300,
    sliding_door_2:   5131, sliding_door_4:   5532,
    lift_slide:       7800, lift_slide_fixed: 2757,
    openable_door_1:  5000, openable_door_2:  5300,
    folding_4:        7200, synchronized:     8500,
    hanging_door:     6000, pocket_sliding:   6500,
    ms_door_single:   4000, ms_door_double:   4500,
    upvc_solid:       5000,
    l_corner_fix:     2757, l_corner_openable:4300,
    box_fix_frame:    1600, curtain_wall:     5200,
  },
  'uPVC White': {
    openable_1:       1825, openable_2:       2208,
    fixed_no_div:      969, fixed_div:        1100,
    top_hung_1:       1800, sliding_win_2:    2170, sliding_win_1: 1800,
    sliding_door_2:   2170, sliding_door_4:   2634,
    lift_slide:       3500, lift_slide_fixed:  969,
    openable_door_1:  2200, openable_door_2:  2400,
    folding_4:        3800, synchronized:     4500,
    hanging_door:     3000, pocket_sliding:   3200,
    ms_door_single:   1800, ms_door_double:   2000,
    upvc_solid:       2500,
    l_corner_fix:      969, l_corner_openable:1800,
    box_fix_frame:     750, curtain_wall:     2200,
  },
  'uPVC Black Lami': {
    openable_1:       2100, openable_2:       2400,
    fixed_no_div:     1100, fixed_div:        1250,
    top_hung_1:       2000, sliding_win_2:    2450, sliding_win_1: 2000,
    sliding_door_2:   2450, sliding_door_4:   2900,
    lift_slide:       3800, lift_slide_fixed: 1100,
    openable_door_1:  2500, openable_door_2:  2700,
    folding_4:        4200, synchronized:     5000,
    hanging_door:     3300, pocket_sliding:   3500,
    ms_door_single:   2000, ms_door_double:   2200,
    upvc_solid:       2800,
    l_corner_fix:     1100, l_corner_openable:2000,
    box_fix_frame:     850, curtain_wall:     2500,
  },
};

// Glass rates per sqft (from GlassCo)
export const GLASS_RATES: Record<string, number> = {
  sg_5_clear: 150, sg_6_clear: 180, sg_6_frosted: 210,
  sg_8_clear: 260, sg_8_grey:  290, sg_10_clear: 350,
  sg_12_clear: 420, dg_24_clear: 480, dg_24_frosted: 510,
  lg_12_clear: 540, lg_16_clear: 620, custom: 0,
};

// ─── FLOORS ───────────────────────────────────────────────────────────────────
export const FLOORS = [
  'Basement', 'Ground Floor', 'First Floor',
  'Second Floor', 'Third Floor', 'Roof / Terrace', 'Other',
];

// ─── STANDARD TERMS ───────────────────────────────────────────────────────────
export const STANDARD_TERMS = `Above Prices valid for 10 days from the Date of Quotation.
Sizes will be charged as per standard measurements.
Rates will be revised as per USD rate or market dynamics.
Above Prices are exclusive of all Government Taxes.
All items will be manufactured 5mm short from minimum masonry size for perfect alignment.
Above prices include Locks and accessories. No warranty/guarantee for hardware.
Black Handles & Hinges to be used. Electricity to be arranged by customer on site.
Delivery Time: 4–6 Weeks after advance payment, approval of quotation & final drawings.
Payment Terms: 70% advance on confirmation, 20% before delivery, 10% during installation.`;

// ─── HELPER ───────────────────────────────────────────────────────────────────
export const autoRefNo = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `GT${y}${m}${d}`;
};

export const autoSubject = (profileType: string, sectionSize: string, mode: string) => {
  const glass = mode === 'inclusive' ? '' : ' (Aluminum Only — Glass Separate)';
  return `Quotation for ${sectionSize} ${profileType} Aluminum Window & Door Systems${glass}`;
};

export const validityDate = (days = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
