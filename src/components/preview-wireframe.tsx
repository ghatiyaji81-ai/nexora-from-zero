'use client';

/**
 * Wireframe Miniature Blueprint Previews
 *
 * NOTE: Keep these vector wireframe miniatures in sync with the real workspace UI layouts.
 * Any layout change in Connect, Think, Speak, Create, Build, Discover, or Social
 * should be reflected here so that the peek preview accurately represents the destination.
 */

import React from 'react';

export type PreviewVariant =
  | 'overview'
  | 'focus'
  | 'connect'
  | 'think'
  | 'speak'
  | 'create'
  | 'build'
  | 'discover'
  | 'social'
  | 'foundation'
  | 'productivity';

interface PreviewWireframeProps {
  variant: PreviewVariant | string;
}

export function PreviewWireframe({ variant }: PreviewWireframeProps) {
  const norm = variant.toLowerCase();

  switch (norm) {
    case 'focus':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Central progress ring */}
          <circle cx="100" cy="42" r="24" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle
            cx="100"
            cy="42"
            r="24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeDasharray="150"
            strokeDashoffset="45"
            strokeLinecap="round"
          />
          {/* Digits readout */}
          <rect x="88" y="38" width="24" height="6" rx="2" fill="var(--ink)" />
          {/* Action pill */}
          <rect x="76" y="72" width="48" height="10" rx="5" fill="var(--line-strong)" />
        </svg>
      );

    case 'connect':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Left channel list */}
          <rect x="8" y="10" width="46" height="70" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="14" y="16" width="34" height="4" rx="2" fill="var(--line-strong)" />
          <rect x="14" y="26" width="28" height="3" rx="1.5" fill="var(--line)" />
          <rect x="14" y="34" width="30" height="3" rx="1.5" fill="var(--line)" />
          <rect x="14" y="42" width="24" height="3" rx="1.5" fill="var(--line)" />
          {/* Right chat messages */}
          <rect x="62" y="12" width="70" height="18" rx="6" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <rect x="68" y="18" width="54" height="3" rx="1.5" fill="var(--ink-soft)" />
          <rect x="108" y="35" width="82" height="20" rx="6" fill="var(--accent)" opacity="0.3" />
          <rect x="114" y="42" width="68" height="3.5" rx="1.5" fill="var(--ink)" />
          {/* Composer */}
          <rect x="62" y="64" width="128" height="16" rx="8" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="180" cy="72" r="5" fill="var(--accent)" />
        </svg>
      );

    case 'think':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Left doc sidebar */}
          <rect x="8" y="10" width="42" height="70" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="14" y="18" width="30" height="4" rx="2" fill="var(--line-strong)" />
          <rect x="14" y="28" width="24" height="3" rx="1.5" fill="var(--line)" />
          <rect x="14" y="36" width="26" height="3" rx="1.5" fill="var(--line)" />
          {/* Centered reading canvas */}
          <rect x="60" y="10" width="130" height="70" rx="4" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          {/* Title line */}
          <rect x="72" y="20" width="76" height="6" rx="2" fill="var(--ink)" />
          {/* Content lines */}
          <rect x="72" y="32" width="104" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="72" y="39" width="98" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="72" y="46" width="84" height="3" rx="1.5" fill="var(--line)" />
          {/* Callout box */}
          <rect x="72" y="56" width="104" height="16" rx="4" fill="var(--canvas)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="80" cy="64" r="3" fill="var(--accent)" />
          <rect x="88" y="62.5" width="60" height="3" rx="1.5" fill="var(--ink-soft)" />
        </svg>
      );

    case 'speak':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Center orb */}
          <circle cx="100" cy="38" r="14" fill="var(--accent)" />
          {/* Sound wave ripples */}
          <circle cx="100" cy="38" r="22" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.6" strokeDasharray="4 2" />
          <circle cx="100" cy="38" r="30" fill="none" stroke="var(--accent)" strokeWidth="0.8" opacity="0.3" />
          {/* Waveform visualizer bars */}
          <g transform="translate(45, 66)">
            <rect x="0" y="4" width="4" height="12" rx="2" fill="var(--line-strong)" />
            <rect x="8" y="2" width="4" height="16" rx="2" fill="var(--line-strong)" />
            <rect x="16" y="6" width="4" height="8" rx="2" fill="var(--line-strong)" />
            <rect x="24" y="0" width="4" height="20" rx="2" fill="var(--accent)" />
            <rect x="32" y="3" width="4" height="14" rx="2" fill="var(--ink)" />
            <rect x="40" y="5" width="4" height="10" rx="2" fill="var(--line-strong)" />
            <rect x="48" y="1" width="4" height="18" rx="2" fill="var(--ink)" />
            <rect x="56" y="0" width="4" height="20" rx="2" fill="var(--accent)" />
            <rect x="64" y="4" width="4" height="12" rx="2" fill="var(--line-strong)" />
            <rect x="72" y="2" width="4" height="16" rx="2" fill="var(--line-strong)" />
            <rect x="80" y="6" width="4" height="8" rx="2" fill="var(--line-strong)" />
            <rect x="88" y="4" width="4" height="12" rx="2" fill="var(--line-strong)" />
            <rect x="96" y="2" width="4" height="16" rx="2" fill="var(--line-strong)" />
            <rect x="104" y="5" width="4" height="10" rx="2" fill="var(--line-strong)" />
          </g>
        </svg>
      );

    case 'create':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Top toolbar */}
          <rect x="8" y="8" width="184" height="12" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="16" cy="14" r="2.5" fill="var(--line-strong)" />
          <rect x="24" y="12" width="8" height="4" rx="1" fill="var(--accent)" />
          <circle cx="38" cy="14" r="2.5" fill="var(--line-strong)" />
          {/* Center design canvas */}
          <rect x="8" y="24" width="138" height="58" rx="4" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <rect x="22" y="34" width="42" height="28" rx="4" fill="var(--line)" />
          <circle cx="84" cy="48" r="12" fill="var(--accent)" opacity="0.4" />
          <circle cx="94" cy="54" r="8" fill="var(--accent)" />
          {/* Right inspector */}
          <rect x="152" y="24" width="40" height="58" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="158" y="30" width="28" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="158" y="38" width="20" height="3" rx="1.5" fill="var(--line)" />
          <rect x="158" y="46" width="26" height="3" rx="1.5" fill="var(--line)" />
          <rect x="158" y="58" width="28" height="14" rx="3" fill="var(--canvas)" stroke="var(--line)" strokeWidth="1" />
        </svg>
      );

    case 'build':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Left file tree */}
          <rect x="8" y="8" width="44" height="74" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="14" y="16" width="28" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="18" y="24" width="26" height="2.5" rx="1" fill="var(--line)" />
          <rect x="18" y="31" width="22" height="2.5" rx="1" fill="var(--accent)" />
          <rect x="18" y="38" width="24" height="2.5" rx="1" fill="var(--line)" />
          {/* Code editor */}
          <rect x="56" y="8" width="136" height="52" rx="4" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <rect x="66" y="16" width="36" height="3" rx="1.5" fill="var(--accent)" />
          <rect x="106" y="16" width="48" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="74" y="24" width="68" height="3" rx="1.5" fill="var(--line)" />
          <rect x="74" y="32" width="94" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="66" y="40" width="20" height="3" rx="1.5" fill="var(--ink)" />
          {/* Bottom terminal bar */}
          <rect x="56" y="64" width="136" height="18" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="66" cy="73" r="3" fill="var(--success)" />
          <rect x="74" y="71" width="58" height="3" rx="1.5" fill="var(--ink-soft)" />
        </svg>
      );

    case 'discover':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Search bar */}
          <rect x="14" y="10" width="172" height="16" rx="8" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="1" />
          <circle cx="26" cy="18" r="4" fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" />
          <line x1="29" y1="21" x2="33" y2="25" stroke="var(--ink-soft)" strokeWidth="1.2" />
          <rect x="38" y="16.5" width="60" height="3" rx="1.5" fill="var(--muted)" />
          {/* Result card 1 */}
          <rect x="14" y="32" width="172" height="24" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="22" y="38" width="80" height="3.5" rx="1.5" fill="var(--ink)" />
          <rect x="22" y="45" width="140" height="2.5" rx="1" fill="var(--line-strong)" />
          <circle cx="174" cy="40" r="3" fill="var(--accent)" />
          {/* Result card 2 */}
          <rect x="14" y="60" width="172" height="22" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="22" y="66" width="70" height="3.5" rx="1.5" fill="var(--ink-soft)" />
          <rect x="22" y="73" width="120" height="2.5" rx="1" fill="var(--line)" />
        </svg>
      );

    case 'social':
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Story circles */}
          <circle cx="26" cy="18" r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="26" cy="18" r="7" fill="var(--surface-raised)" />
          <circle cx="50" cy="18" r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="50" cy="18" r="7" fill="var(--surface-raised)" />
          <circle cx="74" cy="18" r="9" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
          <circle cx="74" cy="18" r="7" fill="var(--surface-raised)" />
          <circle cx="98" cy="18" r="9" fill="none" stroke="var(--line)" strokeWidth="1" />
          <circle cx="98" cy="18" r="7" fill="var(--surface-raised)" />
          {/* Feed card */}
          <rect x="14" y="34" width="172" height="48" rx="6" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="26" cy="45" r="5" fill="var(--line-strong)" />
          <rect x="36" y="43" width="48" height="3" rx="1.5" fill="var(--ink)" />
          <rect x="22" y="55" width="154" height="3" rx="1.5" fill="var(--line-strong)" />
          <rect x="22" y="62" width="112" height="3" rx="1.5" fill="var(--line)" />
          <circle cx="26" cy="74" r="3" fill="var(--accent)" />
          <circle cx="36" cy="74" r="3" fill="var(--line-strong)" />
        </svg>
      );

    default: // overview / foundation / productivity
      return (
        <svg viewBox="0 0 200 90" className="wireframe-svg" aria-hidden="true">
          <rect width="200" height="90" rx="8" fill="var(--canvas)" />
          {/* Top 2 hero cards */}
          <rect x="10" y="8" width="86" height="32" rx="4" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="26" cy="24" r="9" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
          <rect x="42" y="18" width="44" height="4" rx="2" fill="var(--ink)" />
          <rect x="42" y="26" width="36" height="2.5" rx="1" fill="var(--line-strong)" />

          <rect x="104" y="8" width="86" height="32" rx="4" fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
          <rect x="114" y="16" width="54" height="4" rx="2" fill="var(--ink)" />
          <rect x="114" y="24" width="68" height="2.5" rx="1" fill="var(--line-strong)" />

          {/* 3x3 miniature tiles */}
          <rect x="10" y="46" width="56" height="36" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="16" y="52" width="28" height="3" rx="1.5" fill="var(--ink-soft)" />
          <rect x="16" y="60" width="40" height="2.5" rx="1" fill="var(--line)" />

          <rect x="72" y="46" width="56" height="36" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="78" y="52" width="28" height="3" rx="1.5" fill="var(--accent)" />
          <rect x="78" y="60" width="40" height="2.5" rx="1" fill="var(--line)" />

          <rect x="134" y="46" width="56" height="36" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <rect x="140" y="52" width="28" height="3" rx="1.5" fill="var(--ink-soft)" />
          <rect x="140" y="60" width="40" height="2.5" rx="1" fill="var(--line)" />
        </svg>
      );
  }
}

