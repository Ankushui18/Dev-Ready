/**
 * Representative Figma designs used by the code-generation test suite.
 * Each fixture: { name, about, build(B) => root, opts?, expect? }
 *   expect.contains: { lang: [strings that must appear] }
 *   expect.truncated: boolean
 */
'use strict';

const HOSTILE = '</script><img src=x onerror=alert(1)> "quoted" {braces} $price \\(interp) */ --> C:\\path';

module.exports = [
  {
    name: 'auto-layout-card',
    about: 'Spacing, padding, alignment and sizing in a vertical auto-layout card',
    build: ({ AL, T }) => AL('Profile card', 'VERTICAL',
      { padding: '24px', gap: '12px', 'border-radius': '16px', background: '#FFFFFF', 'box-shadow': '0 4px 12px 0 rgba(0, 0, 0, 0.08)', width: '320px' }, [
        T('Ankush Sharma', { 'font-size': '20px', 'font-weight': '600', 'line-height': '28px' }),
        T('Product designer · Ghaziabad', { color: '#6B7280' }),
        AL('Actions', 'HORIZONTAL', { gap: '8px', 'justify-content': 'flex-end', 'align-self': 'stretch' }, [
          T('Follow', { color: '#0D99FF', 'font-weight': '500' }), T('Message', { 'font-weight': '500' })
        ], { layoutSizingHorizontal: 'FILL' })
      ], { width: 320, height: 160 }),
    expect: { contains: { 'html-css': ['display: flex', 'gap: 12px', 'padding: 24px', 'border-radius: 16px'], 'react-tailwind': ['flex', 'gap-3', 'p-6'], vue: ['<template>', '</template>', '<style>'], svelte: ['<style>'], 'react-native': ['StyleSheet.create', 'padding: 24', 'gap: 12', 'borderRadius: 16'], flutter: ['Column(', 'spacing: 12', 'BorderRadius.circular(16)', 'EdgeInsets.all(24)'], swiftui: ['VStack', 'spacing: 12'], compose: ['Column', 'Arrangement.spacedBy(12.dp)'] } }
  },
  {
    name: 'nested-components',
    about: 'Repeated instances become a list; variant props are read',
    build: ({ AL, T, INST, COMPONENT, SET }) => {
      const set = SET('Stat card');
      const main = COMPONENT('Size=Default', set);
      const btn = COMPONENT('Primary button');
      const card = (label, value) => INST(main, { 'Size#1:0': { type: 'VARIANT', value: 'Default' } }, 'VERTICAL',
        { padding: '16px', gap: '4px', 'border-radius': '12px', background: '#F9FAFB' },
        [T(label, { 'font-size': '12px', color: '#6B7280' }), T(value, { 'font-size': '20px', 'font-weight': '700' })], { layoutSizingHorizontal: 'FILL' });
      return AL('Dashboard', 'VERTICAL', { padding: '24px', gap: '16px', width: '420px', background: '#FFFFFF' }, [
        T('Weekly insights', { 'font-size': '18px', 'font-weight': '600' }),
        AL('Stats', 'HORIZONTAL', { gap: '12px', 'align-self': 'stretch' }, [card('Sessions', '342'), card('Avg time', '18.2'), card('Peak day', 'Friday')]),
        INST(btn, { 'Label#2:0': { type: 'TEXT', value: 'View report' } }, 'HORIZONTAL', { padding: '12px 24px', 'border-radius': '8px', background: '#0D99FF', 'justify-content': 'center' },
          [T('View report', { color: '#FFFFFF', 'font-weight': '600' })])
      ], { width: 420, height: 260 });
    },
    expect: { contains: { 'html-css': ['<ul', '<li', '<button'], 'react-tailwind': ['<ul', 'function StatCard({ label, value })', '<StatCard label="Peak day" value="Friday" />'], 'react-native': ['function StatCard({ label, value })', '<StatCard label={"Peak day"} value={"Friday"} />', 'Pressable'], flutter: ['class StatCard extends StatelessWidget', 'required this.label', 'InkWell(', 'Expanded('], vue: ['<button'], svelte: ['<button'] } }
  },
  {
    name: 'variables-light-dark',
    about: 'Bound color/spacing variables with light and dark modes become tokens',
    build: ({ AL, T, COLLECTION, VAR }) => {
      const coll = COLLECTION('Theme', ['Light', 'Dark']);
      const surface = VAR(coll, 'surface/default', 'COLOR', { Light: { r: 1, g: 1, b: 1, a: 1 }, Dark: { r: 0.07, g: 0.09, b: 0.15, a: 1 } }, 'var(--surface-default)');
      const text = VAR(coll, 'text/primary', 'COLOR', { Light: { r: 0.07, g: 0.09, b: 0.15, a: 1 }, Dark: { r: 0.98, g: 0.98, b: 0.98, a: 1 } }, 'var(--text-primary)');
      const space = VAR(coll, 'space/400', 'FLOAT', { Light: 16, Dark: 16 }, 'var(--space-400)');
      const title = T('Theme aware', { color: 'var(--text-primary, #111827)', 'font-weight': '600' }, { fills: [{ type: 'SOLID', color: { r: 0.07, g: 0.09, b: 0.15 }, boundVariables: { color: text } }] });
      return AL('Theme card', 'VERTICAL', { padding: 'var(--space-400, 16px)', gap: '8px', background: 'var(--surface-default, #FFF)', 'border-radius': '12px' }, [title, T('Body copy', {})],
        { width: 280, height: 100, boundVariables: { paddingLeft: space, paddingTop: space }, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, boundVariables: { color: surface } }] });
    },
    expect: { contains: { 'html-css': ['--surface-default', '--text-primary', 'var(--surface-default)'], compose: ['AppColors'], swiftui: ['Color'], flutter: ['AppColors.textPrimary', 'class AppColorsDark'], 'react-native': ['colors.textPrimary', 'const colorsDark'], vue: ['var(--surface-default)'], svelte: ['var(--surface-default)'] } }
  },
  {
    name: 'mixed-style-text',
    about: 'Inline weight/color runs and multi-line text',
    build: ({ AL, T }) => {
      const t = T('Revenue up 12% this week', { 'font-size': '16px' });
      t._segs = [
        { characters: 'Revenue up ', fontWeight: 400, fontSize: 16, fills: [{ type: 'SOLID', color: { r: 0.07, g: 0.09, b: 0.15 } }], textDecoration: 'NONE', fontName: { family: 'Inter', style: 'Regular' } },
        { characters: '12%', fontWeight: 700, fontSize: 16, fills: [{ type: 'SOLID', color: { r: 0, g: 0.6, b: 0.3 } }], textDecoration: 'NONE', fontName: { family: 'Inter', style: 'Bold' } },
        { characters: ' this week', fontWeight: 400, fontSize: 16, fills: [{ type: 'SOLID', color: { r: 0.07, g: 0.09, b: 0.15 } }], textDecoration: 'NONE', fontName: { family: 'Inter', style: 'Regular' } }
      ];
      return AL('Summary', 'VERTICAL', { padding: '16px', gap: '8px' }, [t, T('Line one\nLine two', {})], { width: 300, height: 90 });
    },
    expect: { contains: { 'html-css': ['<span', '12%', '<br'], 'react-css': ['<br />'] } }
  },
  {
    name: 'images-and-icons',
    about: 'Image fills, vector icons, export settings and rotation become assets',
    build: ({ AL, T, ICON, IMG, R }) => AL('Media row', 'HORIZONTAL', { padding: '12px', gap: '12px', 'align-items': 'center' }, [
      IMG('Product photo', 64, 64),
      ICON('icon/heart', 24),
      R('Badge', 40, 40, { background: '#F00' }, { exportSettings: [{ format: 'PNG', suffix: '', constraint: { type: 'SCALE', value: 2 } }], rotation: 15 }),
      T('Wireless earbuds', { 'font-weight': '500' })
    ], { width: 320, height: 88 }),
    expect: { contains: { 'html-css': ['assets/product-photo.png', 'assets/', 'alt="Product photo"', 'aria-hidden="true"'], 'html-single': ['<svg class="', 'background-image: var(--img-', ':root {', 'role="img"'] }, assets: 3 }
  },
  {
    name: 'absolute-screen',
    about: 'A frame without auto layout keeps pixel-exact absolute positions',
    build: ({ ABS, T, R }) => {
      const a = R('Hero bg', 375, 200, { background: '#111' }); a.ax = 0; a.ay = 0;
      const t = T('Welcome back', { 'font-size': '28px', color: '#FFF', 'font-weight': '700' }); t.ax = 24; t.ay = 120;
      const b = R('Dot', 8, 8, { background: '#39FF14', 'border-radius': '8px' }); b.ax = 343; b.ay = 24;
      return ABS('Home', 375, 400, { background: '#000' }, [a, t, b]);
    },
    expect: { contains: { 'html-css': ['position: absolute', 'left: 24px', 'top: 120px', 'position: relative'] } }
  },
  {
    name: 'large-frame',
    about: 'Graceful truncation and a visible warning past the layer limit',
    build: ({ AL, T }) => AL('Feed', 'VERTICAL', { gap: '4px' },
      Array.from({ length: 160 }, (_, i) => AL('Row ' + i, 'HORIZONTAL', { gap: '8px' }, [T('Item ' + i, {}), T('Detail', { color: '#666' }), T(String(i), {})])), { width: 360, height: 8000 }),
    opts: { maxNodes: 300 },
    expect: { truncated: true }
  },
  {
    name: 'missing-fonts',
    about: 'Custom and system fonts get fallbacks; works offline',
    build: ({ AL, T }) => AL('Brand', 'VERTICAL', { gap: '4px', padding: '16px' }, [
      T('Gilroy heading', { 'font-family': 'Gilroy', 'font-size': '24px', 'font-weight': '700' }),
      T('SF body', { 'font-family': 'SF Pro Text' }),
      T('Inter body', { 'font-family': 'Inter' })
    ], { width: 300, height: 100 }),
    expect: { contains: { 'html-css': ['Gilroy', 'sans-serif'] } }
  },
  {
    name: 'hostile-content',
    about: 'Layer names and text with markup, quotes, braces, $ and backslashes are escaped in every language',
    build: ({ AL, T, IMG }) => AL(HOSTILE, 'VERTICAL', { padding: '16px', gap: '8px' }, [
      T(HOSTILE, {}),
      T('Price: $5 & ${total} \u0007 \u202Eright-to-left\u202C 😀', {}),
      IMG('Photo " onload="alert(2)', 40, 40),
      T('line1\n  <b>indented</b>', {}),
      T("{{ constructor.constructor('alert(1)')() }} {#if x}{@html y}{/if}", {})
    ], { width: 320, height: 200 }),
    expect: { hostile: true }
  }
];
module.exports.HOSTILE = HOSTILE;
