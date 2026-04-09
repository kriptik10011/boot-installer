// Active layouts only - D (Week View) and E (Debug)
// Layouts A, B, C files exist as reference but are not exported or used
// LayoutESurfacing is lazy-loaded in IntelligentWeekView — not exported here
export { LayoutDHybrid } from './LayoutD-Hybrid';

export type LayoutVariant = 'D' | 'E';
