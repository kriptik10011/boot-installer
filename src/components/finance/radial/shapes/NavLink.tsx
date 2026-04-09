/**
 * NavLink — Cross-domain shortcut button with icon and label.
 * Pure props, cqi-responsive. Used for "View Finances", "Check Inventory", etc.
 */

import { useState } from 'react';
import { BUTTON_MIN_TEXT, FONT_FAMILY } from '../cardTemplate';

interface NavLinkProps {
  icon: string;
  label: string;
  onClick: () => void;
  accentColor: string;
  className?: string;
}

export function NavLink({ icon, label, onClick, accentColor, className }: NavLinkProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`font-semibold rounded-full border transition-[background] duration-150 ${className ?? ''}`}
      style={{
        fontSize: `${BUTTON_MIN_TEXT}cqi`,
        fontFamily: FONT_FAMILY,
        padding: '0.7cqi 2.5cqi',
        background: hovered ? `${accentColor}30` : `${accentColor}15`,
        color: accentColor,
        borderColor: `${accentColor}40`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.8cqi',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
