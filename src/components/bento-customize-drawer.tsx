'use client';

import React from 'react';
import {
  BentoCardId,
  BENTO_CARDS_META,
  BentoCardLayoutItem,
} from '@/lib/bento-layout';

interface BentoCustomizeDrawerProps {
  layout: BentoCardLayoutItem[];
  onToggleVisibility: (id: BentoCardId) => void;
}

export default function BentoCustomizeDrawer({
  layout,
  onToggleVisibility,
}: BentoCustomizeDrawerProps) {
  return (
    <div
      id="bento-customize-drawer"
      className="bento-customize-drawer"
      role="region"
      aria-label="Customize dashboard cards"
    >
      <div className="bento-customize-header">
        <h4>Toggle Dashboard Cards</h4>
        <p>Show, hide, or arrange cards. Changes save automatically.</p>
      </div>
      <div className="bento-customize-grid">
        {layout.map((item) => {
          const meta = BENTO_CARDS_META[item.id];
          return (
            <label key={item.id} className="bento-customize-item">
              <input
                type="checkbox"
                checked={item.visible}
                onChange={() => onToggleVisibility(item.id)}
              />
              <div className="bento-customize-item-text">
                <span className="bento-customize-title">{meta.title}</span>
                <span className="bento-customize-cat">{meta.category}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

