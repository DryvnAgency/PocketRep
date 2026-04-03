export const INDUSTRY_CONFIG: Record<string, { label: string; icon: string }> = {
  auto:      { label: 'Auto Sales',          icon: '🚗' },
  mortgage:  { label: 'Mortgage',            icon: '🏦' },
  realestate:{ label: 'Real Estate',         icon: '🏡' },
  hvac:      { label: 'HVAC',               icon: '🌡️' },
  staffing:  { label: 'Staffing',            icon: '👔' },
  d2d:       { label: 'Door-to-Door',        icon: '🚪' },
  roofing:   { label: 'Roofing',             icon: '🏠' },
  fence:     { label: 'Fence / Landscaping', icon: '🌿' },
  insurance: { label: 'Insurance',           icon: '🛡️' },
  solar:     { label: 'Solar',               icon: '☀️' },
  b2b:       { label: 'B2B / SaaS',          icon: '💼' },
  other:     { label: 'Other',               icon: '⚡' },
};

export const INDUSTRY_KEYS = Object.keys(INDUSTRY_CONFIG) as Array<keyof typeof INDUSTRY_CONFIG>;
