'use client';

import React from 'react';

export type SkeletonVariant = 'text' | 'card' | 'circle' | 'button' | 'custom';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = 'custom',
  width,
  height,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'text':
        return { height: height || '1em', width: width || '100%', borderRadius: '4px' };
      case 'card':
        return { height: height || '180px', width: width || '100%', borderRadius: 'var(--radius-card, 18px)' };
      case 'circle':
        const size = width || height || '40px';
        return { width: size, height: size, borderRadius: '50%' };
      case 'button':
        return { height: height || '38px', width: width || '100px', borderRadius: 'var(--radius-md, 10px)' };
      default:
        return { width, height };
    }
  };

  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className={`skeleton-shimmer ${className}`.trim()}
      style={{ ...getVariantStyles(), ...style }}
      {...props}
    >
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

