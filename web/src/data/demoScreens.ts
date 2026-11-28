import type { DevReadyBundle, InspectLayer } from '../types';

const ICON_GRID = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;
const ICON_ACTIVITY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const ICON_CARD = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
const ICON_USERS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const ICON_ARROW_UP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;
const ICON_LOCK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_CARD_BLUE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D99FF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
const ICON_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export const DEMO_SCREENS: DevReadyBundle[] = [
  {
    version: 1,
    id: 'demo-pulsepay-dashboard',
    name: 'Revenue Overview — Desktop',
    fileName: 'Mercury Finance UI Kit',
    pageName: 'Desktop · Analytics',
    status: 'ready',
    updatedAt: '2026-11-26T10:15:00.000Z',
    source: 'demo',
    width: 920,
    height: 600,
    backgroundColor: '#FAFAFB',
    tokenModes: ['Light', 'Dark'],
    notes: '16px card padding, 12px radius, 1px #E5E7EB hairlines. Primary button uses --color-ink-primary.',
    checklist: [
      { id: 'c1', text: 'Match 14px gap across KPI MetricCard row', done: true },
      { id: 'c2', text: 'Bind --color-accent-blue token to peak Friday bar', done: true },
      { id: 'c3', text: 'Use tabular numerals on currency & percentage values', done: false }
    ],
    annotations: [
      {
        id: 'ann-1',
        layerId: 'dash-cta',
        category: 'a11y',
        text: '2px #0D99FF focus ring · aria-label="Export revenue CSV"',
        createdAt: '2026-11-27T09:10:00.000Z'
      },
      {
        id: 'ann-2',
        layerId: 'kpi-1',
        category: 'interaction',
        text: 'Hover raises border to #CBD5E1; click drills into cohort view',
        createdAt: '2026-11-27T09:12:00.000Z'
      }
    ],
    devResources: [
      {
        id: 'res-1',
        layerId: 'kpi-1',
        label: 'components/MetricCard.tsx',
        url: 'https://github.com/acme/mercury-ui/blob/main/src/components/MetricCard.tsx',
        kind: 'github'
      },
      {
        id: 'res-2',
        label: 'Storybook · Revenue Overview',
        url: 'https://storybook.js.org/showcase',
        kind: 'storybook'
      }
    ],
    codeConnect: {
      MetricCard: {
        componentName: 'MetricCard',
        importPath: "import { MetricCard } from '@/components/ui/metric-card';",
        snippet: `<MetricCard\n  label="Net Volume"\n  value="$184,290"\n  delta="+18.4%"\n  trend="positive"\n/>`,
        docsUrl: 'https://github.com/acme/mercury-ui/blob/main/src/components/MetricCard.tsx'
      },
      'Button / Primary': {
        componentName: 'Button / Primary',
        importPath: "import { Button } from '@/components/ui/button';",
        snippet: `<Button variant="primary" size="md">\n  Export CSV\n</Button>`
      }
    },
    history: [
      { id: 'h-1', summary: 'Marked Ready for dev · tokens & KPI spacing finalized', status: 'ready', timestamp: '2026-11-27T09:15:00.000Z' },
      { id: 'h-2', summary: 'Connected MetricCard & Button / Primary via Code Connect', timestamp: '2026-11-26T16:40:00.000Z' },
      { id: 'h-3', summary: 'Initial handoff snapshot imported from Figma', status: 'in-progress', timestamp: '2026-11-25T11:20:00.000Z' }
    ],
    tokens: [
      { name: 'color-bg-app', category: 'color', value: '#FAFAFB', modes: { Light: '#FAFAFB', Dark: '#0B0C0E' } },
      { name: 'color-surface', category: 'color', value: '#FFFFFF', modes: { Light: '#FFFFFF', Dark: '#14161A' } },
      { name: 'color-ink-primary', category: 'color', value: '#111827', modes: { Light: '#111827', Dark: '#F9FAFB' } },
      { name: 'color-ink-secondary', category: 'color', value: '#6B7280', modes: { Light: '#6B7280', Dark: '#9CA3AF' } },
      { name: 'color-accent-blue', category: 'color', value: '#2563EB', modes: { Light: '#2563EB', Dark: '#3B82F6' } },
      { name: 'color-positive', category: 'color', value: '#059669', modes: { Light: '#059669', Dark: '#34D399' } },
      { name: 'color-border', category: 'color', value: '#E5E7EB', modes: { Light: '#E5E7EB', Dark: '#23262F' } },
      { name: 'space-4', category: 'spacing', value: '16px' },
      { name: 'space-5', category: 'spacing', value: '20px' },
      { name: 'radius-card', category: 'radius', value: '12px' },
      { name: 'radius-btn', category: 'radius', value: '8px' },
      { name: 'shadow-xs', category: 'shadow', value: '0 1px 2px rgba(16,24,40,0.05)' }
    ],
    assets: [
      { id: 'asset-grid', name: 'icon-overview', format: 'SVG', width: 15, height: 15, svg: ICON_GRID },
      { id: 'asset-act', name: 'icon-activity', format: 'SVG', width: 15, height: 15, svg: ICON_ACTIVITY },
      { id: 'asset-card', name: 'icon-cards', format: 'SVG', width: 15, height: 15, svg: ICON_CARD },
      { id: 'asset-users', name: 'icon-customers', format: 'SVG', width: 15, height: 15, svg: ICON_USERS },
      { id: 'asset-up', name: 'icon-trend-up', format: 'SVG', width: 12, height: 12, svg: ICON_ARROW_UP }
    ],
    root: {
      id: 'dash-root',
      name: 'Revenue Overview — Desktop',
      type: 'FRAME',
      x: 0,
      y: 0,
      width: 920,
      height: 600,
      radius: 12,
      clipsContent: true,
      fills: [{ type: 'SOLID', color: '#FAFAFB', token: '--color-bg-app' }],
      children: [
        // Crisp Light Minimal Sidebar (Stripe/Linear style)
        {
          id: 'dash-sidebar',
          name: 'Sidebar',
          type: 'FRAME',
          x: 0,
          y: 0,
          width: 204,
          height: 600,
          fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
          strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
          autoLayout: { direction: 'VERTICAL', gap: 6, paddingTop: 20, paddingRight: 14, paddingBottom: 20, paddingLeft: 14 },
          children: [
            {
              id: 'dash-brand',
              name: 'Workspace Switcher',
              type: 'FRAME',
              x: 14,
              y: 20,
              width: 176,
              height: 36,
              autoLayout: { direction: 'HORIZONTAL', gap: 10, paddingTop: 4, paddingRight: 6, paddingBottom: 4, paddingLeft: 6, alignItems: 'CENTER' },
              children: [
                {
                  id: 'dash-logo-mark',
                  name: 'Brand Avatar',
                  type: 'RECTANGLE',
                  x: 20,
                  y: 25,
                  width: 26,
                  height: 26,
                  radius: 7,
                  fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }]
                },
                {
                  id: 'dash-logo-letter',
                  name: 'Logo Initial',
                  type: 'TEXT',
                  x: 20,
                  y: 25,
                  width: 26,
                  height: 26,
                  text: 'M',
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }],
                  typography: { fontFamily: 'Inter', fontWeight: 700, fontSize: 13, lineHeight: 26, textAlign: 'CENTER' }
                },
                {
                  id: 'dash-logo-text',
                  name: 'Workspace Name',
                  type: 'TEXT',
                  x: 56,
                  y: 28,
                  width: 112,
                  height: 20,
                  text: 'Mercury Inc.',
                  fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }],
                  typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 13.5, lineHeight: 20, letterSpacing: -0.2 }
                }
              ]
            },
            {
              id: 'nav-active',
              name: 'Nav Item / Overview',
              type: 'INSTANCE',
              componentName: 'NavRow / Active',
              interactive: true,
              x: 14,
              y: 74,
              width: 176,
              height: 34,
              radius: 7,
              fills: [{ type: 'SOLID', color: '#F3F4F6' }],
              autoLayout: { direction: 'HORIZONTAL', gap: 9, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 10, alignItems: 'CENTER' },
              children: [
                { id: 'nav-ic-1', name: 'Icon / Overview', type: 'VECTOR', x: 24, y: 83, width: 15, height: 15, svg: ICON_GRID },
                {
                  id: 'nav-lbl-1',
                  name: 'Overview Label',
                  type: 'TEXT',
                  x: 48,
                  y: 82,
                  width: 110,
                  height: 18,
                  text: 'Overview',
                  fills: [{ type: 'SOLID', color: '#111827' }],
                  typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12.5, lineHeight: 18 }
                }
              ]
            },
            {
              id: 'nav-activity',
              name: 'Nav Item / Activity',
              type: 'INSTANCE',
              componentName: 'NavRow',
              interactive: true,
              x: 14,
              y: 112,
              width: 176,
              height: 34,
              radius: 7,
              autoLayout: { direction: 'HORIZONTAL', gap: 9, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 10, alignItems: 'CENTER' },
              children: [
                { id: 'nav-ic-2', name: 'Icon / Activity', type: 'VECTOR', x: 24, y: 121, width: 15, height: 15, svg: ICON_ACTIVITY },
                {
                  id: 'nav-lbl-2',
                  name: 'Activity Label',
                  type: 'TEXT',
                  x: 48,
                  y: 120,
                  width: 110,
                  height: 18,
                  text: 'Transactions',
                  fills: [{ type: 'SOLID', color: '#4B5563' }],
                  typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12.5, lineHeight: 18 }
                }
              ]
            },
            {
              id: 'nav-cards',
              name: 'Nav Item / Cards',
              type: 'INSTANCE',
              componentName: 'NavRow',
              interactive: true,
              x: 14,
              y: 150,
              width: 176,
              height: 34,
              radius: 7,
              autoLayout: { direction: 'HORIZONTAL', gap: 9, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 10, alignItems: 'CENTER' },
              children: [
                { id: 'nav-ic-3', name: 'Icon / Cards', type: 'VECTOR', x: 24, y: 159, width: 15, height: 15, svg: ICON_CARD },
                {
                  id: 'nav-lbl-3',
                  name: 'Cards Label',
                  type: 'TEXT',
                  x: 48,
                  y: 158,
                  width: 110,
                  height: 18,
                  text: 'Treasury Cards',
                  fills: [{ type: 'SOLID', color: '#4B5563' }],
                  typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12.5, lineHeight: 18 }
                }
              ]
            },
            {
              id: 'nav-customers',
              name: 'Nav Item / Customers',
              type: 'INSTANCE',
              componentName: 'NavRow',
              interactive: true,
              x: 14,
              y: 188,
              width: 176,
              height: 34,
              radius: 7,
              autoLayout: { direction: 'HORIZONTAL', gap: 9, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 10, alignItems: 'CENTER' },
              children: [
                { id: 'nav-ic-4', name: 'Icon / Users', type: 'VECTOR', x: 24, y: 197, width: 15, height: 15, svg: ICON_USERS },
                {
                  id: 'nav-lbl-4',
                  name: 'Customers Label',
                  type: 'TEXT',
                  x: 48,
                  y: 196,
                  width: 110,
                  height: 18,
                  text: 'Customers',
                  fills: [{ type: 'SOLID', color: '#4B5563' }],
                  typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12.5, lineHeight: 18 }
                }
              ]
            },
            // Bottom Treasury Balance Widget
            {
              id: 'sidebar-treasury',
              name: 'Treasury Yield Card',
              type: 'FRAME',
              x: 14,
              y: 496,
              width: 176,
              height: 84,
              radius: 10,
              fills: [{ type: 'SOLID', color: '#F9FAFB' }],
              strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
              autoLayout: { direction: 'VERTICAL', gap: 4, paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 12 },
              children: [
                {
                  id: 'tr-lbl',
                  name: 'Yield Label',
                  type: 'TEXT',
                  x: 26,
                  y: 508,
                  width: 140,
                  height: 16,
                  text: 'Treasury APY',
                  fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }],
                  typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16 }
                },
                {
                  id: 'tr-val',
                  name: 'Yield Rate',
                  type: 'TEXT',
                  x: 26,
                  y: 528,
                  width: 140,
                  height: 22,
                  text: '5.18% Active',
                  fills: [{ type: 'SOLID', color: '#059669', token: '--color-positive' }],
                  typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: 22 }
                },
                {
                  id: 'tr-sub',
                  name: 'Yield Note',
                  type: 'TEXT',
                  x: 26,
                  y: 552,
                  width: 150,
                  height: 16,
                  text: 'Next payout Dec 1',
                  fills: [{ type: 'SOLID', color: '#6B7280' }],
                  typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 11, lineHeight: 16 }
                }
              ]
            }
          ]
        },

        // Page Header
        {
          id: 'dash-header',
          name: 'Page Header',
          type: 'FRAME',
          x: 228,
          y: 24,
          width: 668,
          height: 46,
          autoLayout: { direction: 'HORIZONTAL', gap: 16, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
          children: [
            {
              id: 'dash-h1',
              name: 'Heading',
              type: 'TEXT',
              x: 228,
              y: 24,
              width: 240,
              height: 26,
              text: 'Revenue Overview',
              fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }],
              typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }
            },
            {
              id: 'dash-sub',
              name: 'Date Subtitle',
              type: 'TEXT',
              x: 228,
              y: 52,
              width: 260,
              height: 18,
              text: 'November 2026 · USD Settlement Account',
              fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }],
              typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: 18 }
            },
            {
              id: 'dash-cta',
              name: 'Send Money Button',
              type: 'COMPONENT',
              componentName: 'Button / Primary',
              interactive: true,
              x: 766,
              y: 28,
              width: 130,
              height: 36,
              radius: 8,
              radiusToken: '--radius-btn',
              fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }],
              effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(17,24,39,0.12)' }],
              autoLayout: { direction: 'HORIZONTAL', gap: 6, paddingTop: 8, paddingRight: 14, paddingBottom: 8, paddingLeft: 14, alignItems: 'CENTER', justifyContent: 'CENTER' },
              children: [
                {
                  id: 'dash-cta-lbl',
                  name: 'Button Label',
                  type: 'TEXT',
                  x: 780,
                  y: 37,
                  width: 102,
                  height: 18,
                  text: 'Move Money',
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }],
                  typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12.5, lineHeight: 18, textAlign: 'CENTER' }
                }
              ]
            }
          ]
        },

        // KPI Row (3 Cards)
        {
          id: 'kpi-row',
          name: 'KPI Metrics Row',
          type: 'FRAME',
          x: 228,
          y: 90,
          width: 668,
          height: 112,
          autoLayout: { direction: 'HORIZONTAL', gap: 14, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          children: [
            {
              id: 'kpi-1',
              name: 'KPI Card / Net Volume',
              type: 'INSTANCE',
              componentName: 'MetricCard',
              x: 228,
              y: 90,
              width: 213,
              height: 112,
              radius: 12,
              radiusToken: '--radius-card',
              fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
              strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
              effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(16,24,40,0.04)' }],
              autoLayout: { direction: 'VERTICAL', gap: 8, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
              children: [
                { id: 'kpi-1-lbl', name: 'Label', type: 'TEXT', x: 244, y: 106, width: 150, height: 16, text: 'Net Volume', fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeight: 16 } },
                { id: 'kpi-1-val', name: 'Value', type: 'TEXT', x: 244, y: 128, width: 170, height: 30, text: '$184,290', fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 } },
                {
                  id: 'kpi-1-pill',
                  name: 'Growth Pill',
                  type: 'FRAME',
                  x: 244,
                  y: 166,
                  width: 74,
                  height: 22,
                  radius: 999,
                  fills: [{ type: 'SOLID', color: '#ECFDF5' }],
                  autoLayout: { direction: 'HORIZONTAL', gap: 3, paddingTop: 2, paddingRight: 7, paddingBottom: 2, paddingLeft: 6, alignItems: 'CENTER' },
                  children: [
                    { id: 'kpi-1-ic', name: 'Arrow Icon', type: 'VECTOR', x: 250, y: 171, width: 12, height: 12, svg: ICON_ARROW_UP },
                    { id: 'kpi-1-pct', name: 'Percentage', type: 'TEXT', x: 265, y: 169, width: 46, height: 16, text: '+18.4%', fills: [{ type: 'SOLID', color: '#059669', token: '--color-positive' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 11, lineHeight: 16 } }
                  ]
                }
              ]
            },
            {
              id: 'kpi-2',
              name: 'KPI Card / MRR',
              type: 'INSTANCE',
              componentName: 'MetricCard',
              x: 455,
              y: 90,
              width: 214,
              height: 112,
              radius: 12,
              radiusToken: '--radius-card',
              fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
              strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
              effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(16,24,40,0.04)' }],
              autoLayout: { direction: 'VERTICAL', gap: 8, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
              children: [
                { id: 'kpi-2-lbl', name: 'Label', type: 'TEXT', x: 471, y: 106, width: 150, height: 16, text: 'Recurring MRR', fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeight: 16 } },
                { id: 'kpi-2-val', name: 'Value', type: 'TEXT', x: 471, y: 128, width: 170, height: 30, text: '$62,400', fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 } },
                { id: 'kpi-2-sub', name: 'Subtitle', type: 'TEXT', x: 471, y: 169, width: 170, height: 16, text: '412 active teams', fills: [{ type: 'SOLID', color: '#2563EB', token: '--color-accent-blue' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11.5, lineHeight: 16 } }
              ]
            },
            {
              id: 'kpi-3',
              name: 'KPI Card / Runway',
              type: 'INSTANCE',
              componentName: 'MetricCard',
              x: 683,
              y: 90,
              width: 213,
              height: 112,
              radius: 12,
              radiusToken: '--radius-card',
              fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
              strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
              effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(16,24,40,0.04)' }],
              autoLayout: { direction: 'VERTICAL', gap: 8, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
              children: [
                { id: 'kpi-3-lbl', name: 'Label', type: 'TEXT', x: 699, y: 106, width: 150, height: 16, text: 'Cash Runway', fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeight: 16 } },
                { id: 'kpi-3-val', name: 'Value', type: 'TEXT', x: 699, y: 128, width: 170, height: 30, text: '28 mos', fills: [{ type: 'SOLID', color: '#111827', token: '--color-ink-primary' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 } },
                { id: 'kpi-3-sub', name: 'Subtitle', type: 'TEXT', x: 699, y: 169, width: 170, height: 16, text: 'Net burn -$14.2k / mo', fills: [{ type: 'SOLID', color: '#6B7280', token: '--color-ink-secondary' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 11.5, lineHeight: 16 } }
              ]
            }
          ]
        },

        // Cashflow Chart Card
        {
          id: 'chart-card',
          name: 'Cashflow Chart Card',
          type: 'FRAME',
          x: 228,
          y: 218,
          width: 420,
          height: 358,
          radius: 12,
          radiusToken: '--radius-card',
          fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
          strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
          effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(16,24,40,0.04)' }],
          autoLayout: { direction: 'VERTICAL', gap: 16, paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20 },
          children: [
            { id: 'chart-title', name: 'Chart Heading', type: 'TEXT', x: 248, y: 238, width: 200, height: 20, text: 'Weekly Cash Inflow', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: 20 } },
            {
              id: 'chart-pill',
              name: 'Range Badge',
              type: 'FRAME',
              x: 562,
              y: 236,
              width: 66,
              height: 24,
              radius: 6,
              fills: [{ type: 'SOLID', color: '#F3F4F6' }],
              children: [
                { id: 'chart-pill-t', name: 'Range Text', type: 'TEXT', x: 562, y: 240, width: 66, height: 16, text: 'Last 7d', fills: [{ type: 'SOLID', color: '#4B5563' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } }
              ]
            },
            // Subtle horizontal gridlines
            { id: 'grid-1', name: 'Gridline 30k', type: 'RECTANGLE', x: 248, y: 296, width: 380, height: 1, fills: [{ type: 'SOLID', color: '#F3F4F6' }] },
            { id: 'grid-2', name: 'Gridline 20k', type: 'RECTANGLE', x: 248, y: 374, width: 380, height: 1, fills: [{ type: 'SOLID', color: '#F3F4F6' }] },
            { id: 'grid-3', name: 'Gridline 10k', type: 'RECTANGLE', x: 248, y: 452, width: 380, height: 1, fills: [{ type: 'SOLID', color: '#F3F4F6' }] },
            { id: 'grid-base', name: 'Baseline Axis', type: 'RECTANGLE', x: 248, y: 528, width: 380, height: 1, fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            // Individual evenly spaced bars + crisp centered labels
            { id: 'bar-1', name: 'Bar / Mon', type: 'RECTANGLE', x: 262, y: 416, width: 32, height: 112, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            { id: 'bar-2', name: 'Bar / Tue', type: 'RECTANGLE', x: 316, y: 376, width: 32, height: 152, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            { id: 'bar-3', name: 'Bar / Wed', type: 'RECTANGLE', x: 370, y: 398, width: 32, height: 130, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            { id: 'bar-4', name: 'Bar / Thu', type: 'RECTANGLE', x: 424, y: 344, width: 32, height: 184, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#D1D5DB' }] },
            { id: 'bar-5', name: 'Bar / Fri (Peak)', type: 'RECTANGLE', x: 478, y: 294, width: 32, height: 234, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#2563EB', token: '--color-accent-blue' }] },
            { id: 'bar-6', name: 'Bar / Sat', type: 'RECTANGLE', x: 532, y: 364, width: 32, height: 164, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#D1D5DB' }] },
            { id: 'bar-7', name: 'Bar / Sun', type: 'RECTANGLE', x: 586, y: 388, width: 32, height: 140, radius: [5, 5, 0, 0], fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            { id: 'lbl-mon', name: 'Axis Mon', type: 'TEXT', x: 262, y: 538, width: 32, height: 16, text: 'Mon', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-tue', name: 'Axis Tue', type: 'TEXT', x: 316, y: 538, width: 32, height: 16, text: 'Tue', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-wed', name: 'Axis Wed', type: 'TEXT', x: 370, y: 538, width: 32, height: 16, text: 'Wed', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-thu', name: 'Axis Thu', type: 'TEXT', x: 424, y: 538, width: 32, height: 16, text: 'Thu', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-fri', name: 'Axis Fri', type: 'TEXT', x: 478, y: 538, width: 32, height: 16, text: 'Fri', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-sat', name: 'Axis Sat', type: 'TEXT', x: 532, y: 538, width: 32, height: 16, text: 'Sat', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } },
            { id: 'lbl-sun', name: 'Axis Sun', type: 'TEXT', x: 586, y: 538, width: 32, height: 16, text: 'Sun', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 11, lineHeight: 16, textAlign: 'CENTER' } }
          ]
        },

        // Recent Activity Card
        {
          id: 'tx-card',
          name: 'Recent Settlements',
          type: 'FRAME',
          x: 662,
          y: 218,
          width: 234,
          height: 358,
          radius: 12,
          radiusToken: '--radius-card',
          fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-surface' }],
          strokes: [{ color: '#E5E7EB', width: 1, token: '--color-border' }],
          effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, color: 'rgba(16,24,40,0.04)' }],
          autoLayout: { direction: 'VERTICAL', gap: 12, paddingTop: 20, paddingRight: 16, paddingBottom: 20, paddingLeft: 16 },
          children: [
            { id: 'tx-title', name: 'Section Title', type: 'TEXT', x: 678, y: 238, width: 200, height: 20, text: 'Recent Payouts', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: 20 } },
            {
              id: 'tx-row-1',
              name: 'Payout / Linear Labs',
              type: 'FRAME',
              x: 678,
              y: 274,
              width: 202,
              height: 52,
              radius: 8,
              fills: [{ type: 'SOLID', color: '#F9FAFB' }],
              autoLayout: { direction: 'HORIZONTAL', gap: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
              children: [
                { id: 'tx-1-name', name: 'Merchant', type: 'TEXT', x: 688, y: 284, width: 112, height: 16, text: 'Linear Labs', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 16 } },
                { id: 'tx-1-sub', name: 'Time', type: 'TEXT', x: 688, y: 302, width: 112, height: 14, text: 'Today · ACH', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 10.5, lineHeight: 14 } },
                { id: 'tx-1-amt', name: 'Amount', type: 'TEXT', x: 804, y: 291, width: 66, height: 18, text: '+$4,200', fills: [{ type: 'SOLID', color: '#059669' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 18, textAlign: 'RIGHT' } }
              ]
            },
            {
              id: 'tx-row-2',
              name: 'Payout / Vercel Inc',
              type: 'FRAME',
              x: 678,
              y: 336,
              width: 202,
              height: 52,
              radius: 8,
              fills: [{ type: 'SOLID', color: '#F9FAFB' }],
              autoLayout: { direction: 'HORIZONTAL', gap: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
              children: [
                { id: 'tx-2-name', name: 'Merchant', type: 'TEXT', x: 688, y: 346, width: 112, height: 16, text: 'Vercel Inc.', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 16 } },
                { id: 'tx-2-sub', name: 'Time', type: 'TEXT', x: 688, y: 364, width: 112, height: 14, text: 'Yesterday · Wire', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 10.5, lineHeight: 14 } },
                { id: 'tx-2-amt', name: 'Amount', type: 'TEXT', x: 804, y: 353, width: 66, height: 18, text: '+$2,850', fills: [{ type: 'SOLID', color: '#059669' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 18, textAlign: 'RIGHT' } }
              ]
            },
            {
              id: 'tx-row-3',
              name: 'Payout / Raycast',
              type: 'FRAME',
              x: 678,
              y: 398,
              width: 202,
              height: 52,
              radius: 8,
              fills: [{ type: 'SOLID', color: '#F9FAFB' }],
              autoLayout: { direction: 'HORIZONTAL', gap: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
              children: [
                { id: 'tx-3-name', name: 'Merchant', type: 'TEXT', x: 688, y: 408, width: 112, height: 16, text: 'Raycast Ltd.', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 16 } },
                { id: 'tx-3-sub', name: 'Time', type: 'TEXT', x: 688, y: 426, width: 112, height: 14, text: 'Nov 24 · ACH', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 10.5, lineHeight: 14 } },
                { id: 'tx-3-amt', name: 'Amount', type: 'TEXT', x: 804, y: 415, width: 66, height: 18, text: '+$1,490', fills: [{ type: 'SOLID', color: '#059669' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: 18, textAlign: 'RIGHT' } }
              ]
            },
            {
              id: 'tx-btn',
              name: 'View Ledger Button',
              type: 'FRAME',
              interactive: true,
              x: 678,
              y: 520,
              width: 202,
              height: 36,
              radius: 8,
              fills: [{ type: 'SOLID', color: '#FFFFFF' }],
              strokes: [{ color: '#E5E7EB', width: 1 }],
              children: [
                { id: 'tx-btn-lbl', name: 'Button Label', type: 'TEXT', x: 678, y: 529, width: 202, height: 18, text: 'View full ledger', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeight: 18, textAlign: 'CENTER' } }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    version: 1,
    id: 'demo-ios-checkout',
    name: 'Mobile Checkout — iOS',
    fileName: 'ShopFlow Mobile App',
    pageName: 'iOS · Checkout Flow',
    status: 'in-progress',
    updatedAt: '2026-11-27T08:40:00.000Z',
    source: 'demo',
    width: 390,
    height: 680,
    backgroundColor: '#FFFFFF',
    tokenModes: ['Light', 'Dark'],
    notes: 'Check A11y tab — disclaimer contrast & 32×32 close button tap target flagged.',
    checklist: [
      { id: 'm1', text: 'Increase close button hit area to 44×44px (HIG)', done: false },
      { id: 'm2', text: 'Darken tax disclaimer text for ≥4.5:1 WCAG AA contrast', done: false },
      { id: 'm3', text: 'Pin Pay CTA with safe-area bottom inset', done: true }
    ],
    annotations: [
      {
        id: 'ann-m1',
        layerId: 'ios-close-btn',
        category: 'a11y',
        text: 'Expand hitSlop to 44×44pt while keeping 32×32 visual circle',
        createdAt: '2026-11-27T08:42:00.000Z'
      },
      {
        id: 'ann-m2',
        layerId: 'ios-pay-cta',
        category: 'interaction',
        text: 'Show spinner & disable tap while Apple Pay sheet is presented',
        createdAt: '2026-11-27T08:45:00.000Z'
      }
    ],
    devResources: [
      {
        id: 'res-m1',
        label: 'SHOP-248 · Checkout HIG & contrast fixes',
        url: 'https://linear.app',
        kind: 'linear'
      }
    ],
    codeConnect: {
      'Button / FullWidth': {
        componentName: 'Button / FullWidth',
        importPath: "import { CheckoutPayButton } from '@shopflow/ios-ui';",
        snippet: `<CheckoutPayButton\n  amount="$249.00"\n  icon="lock"\n  fullWidth\n/>`
      }
    },
    history: [
      { id: 'hm-1', summary: 'Flagged A11y contrast & 44pt close target in review', status: 'in-progress', timestamp: '2026-11-27T08:40:00.000Z' },
      { id: 'hm-2', summary: 'Imported iOS Checkout Sheet frame', timestamp: '2026-11-26T14:15:00.000Z' }
    ],
    tokens: [
      { name: 'color-bg', category: 'color', value: '#FFFFFF', modes: { Light: '#FFFFFF', Dark: '#111827' } },
      { name: 'color-surface-muted', category: 'color', value: '#F3F4F6', modes: { Light: '#F3F4F6', Dark: '#1F2937' } },
      { name: 'color-primary', category: 'color', value: '#0D99FF', modes: { Light: '#0D99FF', Dark: '#38BDF8' } },
      { name: 'color-ink', category: 'color', value: '#111827', modes: { Light: '#111827', Dark: '#F9FAFB' } },
      { name: 'radius-sheet', category: 'radius', value: '24px' },
      { name: 'radius-btn', category: 'radius', value: '12px' }
    ],
    assets: [
      { id: 'ios-card-ic', name: 'icon-credit-card', format: 'SVG', width: 18, height: 18, svg: ICON_CARD_BLUE },
      { id: 'ios-lock-ic', name: 'icon-lock-secure', format: 'SVG', width: 14, height: 14, svg: ICON_LOCK }
    ],
    root: {
      id: 'ios-root',
      name: 'iOS Checkout Sheet',
      type: 'FRAME',
      x: 0,
      y: 0,
      width: 390,
      height: 680,
      radius: 24,
      clipsContent: true,
      fills: [{ type: 'SOLID', color: '#FFFFFF', token: '--color-bg' }],
      children: [
        { id: 'ios-grabber', name: 'Sheet Grabber', type: 'RECTANGLE', x: 175, y: 12, width: 40, height: 4, radius: 999, fills: [{ type: 'SOLID', color: '#D1D5DB' }] },
        {
          id: 'ios-header',
          name: 'Sheet Header',
          type: 'FRAME',
          x: 20,
          y: 32,
          width: 350,
          height: 36,
          autoLayout: { direction: 'HORIZONTAL', gap: 12, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
          children: [
            { id: 'ios-title', name: 'Checkout Title', type: 'TEXT', x: 20, y: 36, width: 200, height: 28, text: 'Order Checkout', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 700, fontSize: 20, lineHeight: 28 } },
            {
              id: 'ios-close-btn',
              name: 'Close Icon Button',
              type: 'FRAME',
              interactive: true,
              x: 338,
              y: 34,
              width: 32,
              height: 32,
              radius: 999,
              fills: [{ type: 'SOLID', color: '#F3F4F6' }],
              children: [
                { id: 'ios-close-x', name: 'Close Glyph', type: 'TEXT', x: 338, y: 34, width: 32, height: 32, text: '×', fills: [{ type: 'SOLID', color: '#374151' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 18, lineHeight: 32, textAlign: 'CENTER' } }
              ]
            }
          ]
        },
        {
          id: 'ios-summary-card',
          name: 'Order Summary Card',
          type: 'FRAME',
          x: 20,
          y: 88,
          width: 350,
          height: 164,
          radius: 16,
          fills: [{ type: 'SOLID', color: '#F9FAFB' }],
          strokes: [{ color: '#E5E7EB', width: 1 }],
          autoLayout: { direction: 'VERTICAL', gap: 12, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
          children: [
            { id: 'ios-item-name', name: 'Product Title', type: 'TEXT', x: 36, y: 104, width: 240, height: 22, text: 'Studio Monitor Headphones', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 15, lineHeight: 22 } },
            { id: 'ios-item-meta', name: 'Variant Subtitle', type: 'TEXT', x: 36, y: 128, width: 220, height: 18, text: 'Matte Obsidian · Qty 1', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 13, lineHeight: 18 } },
            { id: 'ios-divider', name: 'Divider', type: 'RECTANGLE', x: 36, y: 162, width: 318, height: 1, fills: [{ type: 'SOLID', color: '#E5E7EB' }] },
            { id: 'ios-total-lbl', name: 'Total Label', type: 'TEXT', x: 36, y: 180, width: 140, height: 20, text: 'Total due today', fills: [{ type: 'SOLID', color: '#4B5563' }], typography: { fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeight: 20 } },
            { id: 'ios-total-amt', name: 'Total Amount', type: 'TEXT', x: 244, y: 176, width: 110, height: 28, text: '$249.00', fills: [{ type: 'SOLID', color: '#111827' }], typography: { fontFamily: 'Inter', fontWeight: 700, fontSize: 22, lineHeight: 28, textAlign: 'RIGHT' } },
            { id: 'ios-disclaimer', name: 'Tax Disclaimer (Low Contrast)', type: 'TEXT', x: 36, y: 214, width: 318, height: 16, text: 'Includes free express shipping & 2-year warranty', fills: [{ type: 'SOLID', color: '#B5BAC2' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 11, lineHeight: 16 } }
          ]
        },
        {
          id: 'ios-pay-section',
          name: 'Payment Method Card',
          type: 'FRAME',
          x: 20,
          y: 272,
          width: 350,
          height: 76,
          radius: 14,
          fills: [{ type: 'SOLID', color: '#EFF6FF' }],
          strokes: [{ color: '#0D99FF', width: 1.5 }],
          autoLayout: { direction: 'HORIZONTAL', gap: 12, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, alignItems: 'CENTER' },
          children: [
            { id: 'ios-card-icon', name: 'Card Icon', type: 'VECTOR', x: 36, y: 301, width: 18, height: 18, svg: ICON_CARD_BLUE },
            { id: 'ios-card-label', name: 'Card Number', type: 'TEXT', x: 66, y: 290, width: 210, height: 20, text: 'Visa ending in 4242', fills: [{ type: 'SOLID', color: '#0F172A' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: 20 } },
            { id: 'ios-card-exp', name: 'Card Expiry', type: 'TEXT', x: 66, y: 312, width: 140, height: 16, text: 'Expires 08 / 2029', fills: [{ type: 'SOLID', color: '#475569' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: 16 } }
          ]
        },
        {
          id: 'ios-promo-input',
          name: 'Promo Code Input',
          type: 'FRAME',
          interactive: true,
          x: 20,
          y: 368,
          width: 350,
          height: 48,
          radius: 12,
          fills: [{ type: 'SOLID', color: '#FFFFFF' }],
          strokes: [{ color: '#D1D5DB', width: 1 }],
          autoLayout: { direction: 'HORIZONTAL', gap: 8, paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 14, alignItems: 'CENTER', justifyContent: 'SPACE_BETWEEN' },
          children: [
            { id: 'ios-promo-ph', name: 'Input Placeholder', type: 'TEXT', x: 34, y: 383, width: 200, height: 18, text: 'Enter promo code (optional)', fills: [{ type: 'SOLID', color: '#6B7280' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 13, lineHeight: 18 } },
            { id: 'ios-apply-btn', name: 'Apply Link Button', type: 'TEXT', interactive: true, x: 312, y: 383, width: 44, height: 18, text: 'Apply', fills: [{ type: 'SOLID', color: '#0D99FF' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 13, lineHeight: 18, textAlign: 'RIGHT' } }
          ]
        },
        {
          id: 'ios-pay-cta',
          name: 'Pay Now Primary CTA',
          type: 'COMPONENT',
          componentName: 'Button / FullWidth',
          interactive: true,
          x: 20,
          y: 602,
          width: 350,
          height: 52,
          radius: 14,
          fills: [{ type: 'SOLID', color: '#0D99FF', token: '--color-primary' }],
          effects: [{ type: 'DROP_SHADOW', x: 0, y: 6, blur: 16, color: 'rgba(13,153,255,0.28)' }],
          autoLayout: { direction: 'HORIZONTAL', gap: 8, paddingTop: 14, paddingRight: 20, paddingBottom: 14, paddingLeft: 20, alignItems: 'CENTER', justifyContent: 'CENTER' },
          children: [
            { id: 'ios-cta-lock', name: 'Lock Icon', type: 'VECTOR', x: 134, y: 621, width: 14, height: 14, svg: ICON_LOCK },
            { id: 'ios-cta-txt', name: 'Pay Button Label', type: 'TEXT', x: 155, y: 618, width: 112, height: 20, text: 'Pay $249.00', fills: [{ type: 'SOLID', color: '#FFFFFF' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 15, lineHeight: 20 } }
          ]
        }
      ]
    }
  },
  {
    version: 1,
    id: 'demo-pricing-modal',
    name: 'Pricing Tiers — Dark',
    fileName: 'Linear Marketing Site',
    pageName: 'Web · Pricing',
    status: 'done',
    updatedAt: '2026-11-25T16:05:00.000Z',
    source: 'demo',
    width: 820,
    height: 490,
    backgroundColor: '#0D0E12',
    tokenModes: ['Dark', 'High Contrast'],
    tokens: [
      { name: 'color-bg-night', category: 'color', value: '#0D0E12', modes: { Dark: '#0D0E12', 'High Contrast': '#020408' } },
      { name: 'color-card-dark', category: 'color', value: '#15171E', modes: { Dark: '#15171E', 'High Contrast': '#0E1015' } },
      { name: 'color-pro-accent', category: 'color', value: '#10B981', modes: { Dark: '#10B981', 'High Contrast': '#34D399' } },
      { name: 'radius-pricing-card', category: 'radius', value: '14px' }
    ],
    assets: [
      { id: 'pr-check', name: 'icon-check', format: 'SVG', width: 13, height: 13, svg: ICON_CHECK }
    ],
    root: {
      id: 'pr-root',
      name: 'Pricing Modal',
      type: 'FRAME',
      x: 0,
      y: 0,
      width: 820,
      height: 490,
      radius: 14,
      clipsContent: true,
      fills: [{ type: 'SOLID', color: '#0D0E12', token: '--color-bg-night' }],
      children: [
        { id: 'pr-heading', name: 'Section Title', type: 'TEXT', x: 210, y: 34, width: 400, height: 34, text: 'Simple, Transparent Pricing', fills: [{ type: 'SOLID', color: '#F9FAFB' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 26, lineHeight: 34, textAlign: 'CENTER', letterSpacing: -0.5 } },
        { id: 'pr-sub', name: 'Section Subtitle', type: 'TEXT', x: 190, y: 74, width: 440, height: 20, text: 'Inspect unlimited Figma frames with zero per-seat Dev Mode tax.', fills: [{ type: 'SOLID', color: '#9CA3AF' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 13.5, lineHeight: 20, textAlign: 'CENTER' } },
        {
          id: 'pr-card-free',
          name: 'Pricing Card / Starter',
          type: 'FRAME',
          x: 36,
          y: 124,
          width: 364,
          height: 326,
          radius: 14,
          fills: [{ type: 'SOLID', color: '#15171E', token: '--color-card-dark' }],
          strokes: [{ color: '#272A34', width: 1 }],
          autoLayout: { direction: 'VERTICAL', gap: 16, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 },
          children: [
            { id: 'pr-f-name', name: 'Tier Name', type: 'TEXT', x: 60, y: 148, width: 120, height: 22, text: 'Starter', fills: [{ type: 'SOLID', color: '#F9FAFB' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 15, lineHeight: 22 } },
            { id: 'pr-f-price', name: 'Price', type: 'TEXT', x: 60, y: 178, width: 160, height: 40, text: '$0 / mo', fills: [{ type: 'SOLID', color: '#FFFFFF' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 32, lineHeight: 40, letterSpacing: -0.8 } },
            { id: 'pr-f-1', name: 'Feature 1', type: 'TEXT', x: 60, y: 240, width: 300, height: 20, text: '✓  Full Hover-to-Measure Dev Mode Canvas', fills: [{ type: 'SOLID', color: '#D1D5DB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            { id: 'pr-f-2', name: 'Feature 2', type: 'TEXT', x: 60, y: 270, width: 300, height: 20, text: '✓  12 Codegen Targets + Token Exports', fills: [{ type: 'SOLID', color: '#D1D5DB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            { id: 'pr-f-3', name: 'Feature 3', type: 'TEXT', x: 60, y: 300, width: 300, height: 20, text: '✓  End-to-End Encrypted Share Links', fills: [{ type: 'SOLID', color: '#D1D5DB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            {
              id: 'pr-f-btn',
              name: 'Starter CTA Button',
              type: 'FRAME',
              interactive: true,
              x: 60,
              y: 382,
              width: 316,
              height: 42,
              radius: 9,
              fills: [{ type: 'SOLID', color: '#272A34' }],
              children: [
                { id: 'pr-f-btn-t', name: 'CTA Label', type: 'TEXT', x: 60, y: 393, width: 316, height: 20, text: 'Get Started Free', fills: [{ type: 'SOLID', color: '#F9FAFB' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 13.5, lineHeight: 20, textAlign: 'CENTER' } }
              ]
            }
          ]
        },
        {
          id: 'pr-card-pro',
          name: 'Pricing Card / Team Studio',
          type: 'FRAME',
          x: 420,
          y: 124,
          width: 364,
          height: 326,
          radius: 14,
          fills: [{ type: 'SOLID', color: '#15171E', token: '--color-card-dark' }],
          strokes: [{ color: '#10B981', width: 1.5, token: '--color-pro-accent' }],
          autoLayout: { direction: 'VERTICAL', gap: 16, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 },
          children: [
            { id: 'pr-p-name', name: 'Tier Name', type: 'TEXT', x: 444, y: 148, width: 160, height: 22, text: 'Team Workspace', fills: [{ type: 'SOLID', color: '#34D399' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 15, lineHeight: 22 } },
            { id: 'pr-p-price', name: 'Price', type: 'TEXT', x: 444, y: 178, width: 180, height: 40, text: '$12 / mo', fills: [{ type: 'SOLID', color: '#FFFFFF' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 32, lineHeight: 40, letterSpacing: -0.8 } },
            { id: 'pr-p-1', name: 'Feature 1', type: 'TEXT', x: 444, y: 240, width: 310, height: 20, text: '✓  Unlimited Developers & Guest Viewers', fills: [{ type: 'SOLID', color: '#E5E7EB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            { id: 'pr-p-2', name: 'Feature 2', type: 'TEXT', x: 444, y: 270, width: 310, height: 20, text: '✓  Permanent Cloud Handoff History', fills: [{ type: 'SOLID', color: '#E5E7EB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            { id: 'pr-p-3', name: 'Feature 3', type: 'TEXT', x: 444, y: 300, width: 310, height: 20, text: '✓  Custom Design Token GitHub Sync', fills: [{ type: 'SOLID', color: '#E5E7EB' }], typography: { fontFamily: 'Inter', fontWeight: 400, fontSize: 12.5, lineHeight: 20 } },
            {
              id: 'pr-p-btn',
              name: 'Pro CTA Button',
              type: 'FRAME',
              interactive: true,
              x: 444,
              y: 382,
              width: 316,
              height: 42,
              radius: 9,
              fills: [{ type: 'SOLID', color: '#10B981', token: '--color-pro-accent' }],
              children: [
                { id: 'pr-p-btn-t', name: 'CTA Label', type: 'TEXT', x: 444, y: 393, width: 316, height: 20, text: 'Upgrade Workspace', fills: [{ type: 'SOLID', color: '#022C22' }], typography: { fontFamily: 'Inter', fontWeight: 600, fontSize: 13.5, lineHeight: 20, textAlign: 'CENTER' } }
              ]
            }
          ]
        }
      ]
    }
  }
];

function cloneSnapshot(
  root: InspectLayer,
  mutate: (layer: InspectLayer) => void,
  omitIds: string[] = []
): InspectLayer {
  const omit = new Set(omitIds);
  const walk = (node: InspectLayer): InspectLayer | null => {
    if (omit.has(node.id)) return null;
    const copy: InspectLayer = {
      ...node,
      fills: node.fills ? node.fills.map(f => ({ ...f })) : undefined,
      strokes: node.strokes ? node.strokes.map(s => ({ ...s })) : undefined,
      effects: node.effects ? node.effects.map(e => ({ ...e })) : undefined,
      autoLayout: node.autoLayout ? { ...node.autoLayout } : undefined,
      typography: node.typography ? { ...node.typography } : undefined,
      children: node.children
        ? (node.children.map(walk).filter(Boolean) as InspectLayer[])
        : undefined
    };
    mutate(copy);
    return copy;
  };
  return walk(root)!;
}

// Attach realistic historical snapshots to demo screens so Compare Changes works out of the box
(function attachDemoSnapshots() {
  const dash = DEMO_SCREENS.find(s => s.id === 'demo-pulsepay-dashboard');
  if (dash && dash.history) {
    const snapV2 = cloneSnapshot(
      dash.root,
      l => {
        if (l.id === 'dash-cta') {
          l.fills = [{ type: 'SOLID', color: '#1D4ED8', token: '--color-accent-blue' }];
          l.radius = 6;
        }
        if (l.id === 'dash-cta-lbl') l.text = 'Download CSV';
        if (l.id === 'kpi-1') {
          if (l.autoLayout) {
            l.autoLayout.paddingTop = 14;
            l.autoLayout.paddingBottom = 14;
            l.autoLayout.paddingLeft = 14;
            l.autoLayout.paddingRight = 14;
          }
          l.radius = 10;
        }
        if (l.id === 'kpi-1-val') l.text = '$176,840';
        if (l.id === 'bar-5') {
          l.fills = [{ type: 'SOLID', color: '#60A5FA' }];
          l.radius = 4;
        }
      },
      ['kpi-1-pill']
    );

    const snapV1 = cloneSnapshot(
      dash.root,
      l => {
        if (l.id === 'dash-root') l.fills = [{ type: 'SOLID', color: '#F3F4F6' }];
        if (l.id === 'dash-h1') {
          l.text = 'Revenue Dashboard';
          if (l.typography) l.typography.fontSize = 20;
        }
        if (l.id === 'dash-cta') {
          l.fills = [{ type: 'SOLID', color: '#374151' }];
          l.radius = 4;
          l.height = 32;
        }
        if (l.id === 'kpi-1') {
          l.strokes = [{ color: '#D1D5DB', width: 1 }];
          l.radius = 8;
        }
        if (l.id === 'kpi-1-val') l.text = '$162,100';
        if (l.id === 'bar-5') {
          l.fills = [{ type: 'SOLID', color: '#93C5FD' }];
        }
        if (l.id === 'chart-card') {
          l.strokes = [{ color: '#D1D5DB', width: 1 }];
        }
      },
      ['kpi-1-pill', 'chart-pill']
    );

    dash.history = [
      { ...dash.history[0], author: 'Ankush', rootSnapshot: dash.root },
      {
        ...dash.history[1],
        author: 'Maya',
        summary: 'Updated primary CTA fill, KPI padding & Friday peak bar',
        status: 'ready',
        rootSnapshot: snapV2
      },
      { ...dash.history[2], author: 'Maya', rootSnapshot: snapV1 }
    ];
  }

  const ios = DEMO_SCREENS.find(s => s.id === 'demo-ios-checkout');
  if (ios && ios.history) {
    const snapIos = cloneSnapshot(
      ios.root,
      l => {
        if (l.id === 'ios-pay-cta') {
          l.fills = [{ type: 'SOLID', color: '#2563EB' }];
          l.radius = 10;
          l.height = 46;
        }
        if (l.id === 'ios-total-amt') l.text = '$229.00';
        if (l.id === 'ios-summary-card') {
          l.radius = 12;
          l.strokes = [{ color: '#D1D5DB', width: 1 }];
        }
      },
      ['ios-promo-input']
    );
    ios.history = [
      { ...ios.history[0], author: 'Ankush', rootSnapshot: ios.root },
      { ...ios.history[1], author: 'Elena', status: 'ready', rootSnapshot: snapIos }
    ];
  }

  const pricing = DEMO_SCREENS.find(s => s.id === 'demo-pricing-modal');
  if (pricing) {
    const snapPricing = cloneSnapshot(pricing.root, l => {
      if (l.id === 'pr-card-pro') {
        l.strokes = [{ color: '#3B82F6', width: 1.5 }];
        l.radius = 10;
      }
      if (l.id === 'pr-p-btn') {
        l.fills = [{ type: 'SOLID', color: '#3B82F6' }];
        l.radius = 6;
      }
      if (l.id === 'pr-p-price') l.text = '$19 / mo';
      if (l.id === 'pr-p-btn-t') {
        l.text = 'Start Pro Trial';
        l.fills = [{ type: 'SOLID', color: '#FFFFFF' }];
      }
    });
    pricing.history = [
      {
        id: 'hp-1',
        author: 'Ankush',
        summary: 'Shipped emerald accent & $12/mo Team pricing',
        status: 'done',
        timestamp: '2026-11-26T18:00:00.000Z',
        rootSnapshot: pricing.root
      },
      {
        id: 'hp-2',
        author: 'Elena',
        summary: 'Previous blue Pro tier exploration ($19/mo)',
        status: 'ready',
        timestamp: '2026-11-24T13:30:00.000Z',
        rootSnapshot: snapPricing
      }
    ];
  }
})();

