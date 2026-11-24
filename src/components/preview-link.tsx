'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PreviewWireframe, PreviewVariant } from '@/components/preview-wireframe';

export interface PreviewData {
  title: string;
  description: string;
  status: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  variant: PreviewVariant | string;
}

export interface PreviewLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
  preview: PreviewData;
  placement?: 'right' | 'top' | 'bottom' | 'left';
  className?: string;
}

export function PreviewLink({
  href,
  children,
  preview,
  placement = 'right',
  className = '',
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: PreviewLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Clear timer helper
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Check if touch device
  const isTouchDevice = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none) or (pointer: coarse)').matches;
  };

  const handleTouchStart = () => {
    clearTimer();
    setIsOpen(false);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isTouchDevice()) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 350);
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    clearTimer();
    setIsOpen(false);
    onMouseLeave?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLAnchorElement>) => {
    if (isTouchDevice()) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 350);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLAnchorElement>) => {
    clearTimer();
    setIsOpen(false);
    onBlur?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Escape') {
      clearTimer();
      setIsOpen(false);
    } else if (e.key === ' ' && isOpen && (preview.actionHref || preview.onAction)) {
      e.preventDefault();
      clearTimer();
      setIsOpen(false);
      if (preview.onAction) {
        preview.onAction();
      } else if (preview.actionHref) {
        router.push(preview.actionHref);
      }
    }
    onKeyDown?.(e);
  };

  // Scroll and Escape dismiss listener
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      clearTimer();
      setIsOpen(false);
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimer();
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, []);

  return (
    <div className="preview-link-container" ref={containerRef}>
      <Link
        href={href}
        className={className}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        {...props}
      >
        {children}
      </Link>

      {isOpen && (
        <div
          className="preview-card"
          data-placement={placement}
          role="dialog"
          aria-label={`${preview.title} preview`}
          onMouseEnter={() => {
            // Keep open if user hovers into the peek card
            clearTimer();
            setIsOpen(true);
          }}
          onMouseLeave={() => {
            setIsOpen(false);
          }}
        >
          <div className="preview-wireframe-wrap">
            <PreviewWireframe variant={preview.variant} />
          </div>

          <div className="preview-content">
            <div className="preview-topline">
              <h4 className="preview-title">{preview.title}</h4>
              <span className="preview-status-badge">
                <span className="preview-status-dot" aria-hidden="true" />
                <span>{preview.status}</span>
              </span>
            </div>

            <p className="preview-desc">{preview.description}</p>

            {preview.actionLabel && (
              <div className="preview-footer">
                <button
                  type="button"
                  className="preview-action-button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    if (preview.onAction) {
                      preview.onAction();
                    } else if (preview.actionHref) {
                      router.push(preview.actionHref);
                    }
                  }}
                >
                  <span>{preview.actionLabel}</span>
                  <kbd className="preview-kbd">Space</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

