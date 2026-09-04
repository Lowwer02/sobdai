import React from 'react'
import Image from 'next/image'

export type ArrowDirection =
  | 'down'
  | 'down-right'
  | 'down-left'
  | 'up-right'
  | 'up-left'
  | 'right'
  | 'left'

export interface ArrowConfig {
  direction?: ArrowDirection
  top?: string
  bottom?: string
  left?: string
  right?: string
  className?: string
}

export interface CircleTargetConfig {
  top: string
  bottom?: string
  left?: string
  right?: string
  width: string
  height: string
}

export interface AnnotationConfig {
  text: string
  labelPosition: {
    top?: string
    bottom?: string
    left?: string
    right?: string
  }
  arrow?: ArrowConfig
  circleTarget?: CircleTargetConfig
}

export interface HelpScreenshotProps {
  src: string
  alt: string
  width: number
  height: number
  caption?: string
  annotation?: AnnotationConfig
  priority?: boolean
  className?: string
}

function HandDrawnArrow({
  direction = 'down',
  className = '',
}: {
  direction?: ArrowDirection
  className?: string
}) {
  switch (direction) {
    case 'down-right':
      return (
        <svg
          viewBox="0 0 40 36"
          fill="none"
          className={`w-7 h-7 sm:w-8 sm:h-8 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          {/* Curved arc down-right */}
          <path
            d="M 6 4 C 10 16, 20 24, 32 30"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          {/* Restrained arrowhead */}
          <path
            d="M 23 29 L 32 30 L 31 21"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'down-left':
      return (
        <svg
          viewBox="0 0 40 36"
          fill="none"
          className={`w-7 h-7 sm:w-8 sm:h-8 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          <path
            d="M 34 4 C 30 16, 20 24, 8 30"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M 9 21 L 8 30 L 17 29"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'up-right':
      return (
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className={`w-7 h-7 sm:w-8 sm:h-8 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          <path
            d="M 6 30 C 12 22, 18 14, 28 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M 19 8 L 28 8 L 27 17"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'up-left':
      return (
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className={`w-7 h-7 sm:w-8 sm:h-8 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          <path
            d="M 30 30 C 24 22, 18 14, 8 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M 9 17 L 8 8 L 17 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'right':
      return (
        <svg
          viewBox="0 0 36 24"
          fill="none"
          className={`w-7 h-5 sm:w-8 sm:h-6 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          <path
            d="M 4 14 C 12 10, 20 14, 28 12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M 21 7 L 28 12 L 22 17"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'down':
    default:
      return (
        <svg
          viewBox="0 0 32 36"
          fill="none"
          className={`w-6 h-7 sm:w-7 sm:h-8 text-[#E6CA85] ${className}`}
          aria-hidden="true"
        >
          <path
            d="M 12 4 C 13 14, 17 22, 16 30"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M 10 24 L 16 30 L 22 24"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

export default function HelpScreenshot({
  src,
  alt,
  width,
  height,
  caption,
  annotation,
  priority = false,
  className = '',
}: HelpScreenshotProps) {
  const labelPos = annotation?.labelPosition

  return (
    <figure className={`my-5 w-full ${className}`}>
      <div className="relative rounded-2xl overflow-hidden border border-[rgba(212,175,55,0.22)] bg-[#140E0A] shadow-xl">
        {/* Screenshot Image */}
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 768px"
          className="w-full h-auto block select-none"
        />

        {/* Optional compact hand-drawn circle around a small control (e.g. timer) */}
        {annotation?.circleTarget && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none text-[#E6CA85]/80"
            style={{
              top: annotation.circleTarget.top,
              bottom: annotation.circleTarget.bottom,
              left: annotation.circleTarget.left,
              right: annotation.circleTarget.right,
              width: annotation.circleTarget.width,
              height: annotation.circleTarget.height,
            }}
          >
            <svg
              viewBox="0 0 100 46"
              fill="none"
              className="w-full h-full overflow-visible"
            >
              <path
                d="M 12 23 C 10 12, 32 6, 52 6 C 76 6, 92 11, 92 23 C 92 34, 74 40, 48 40 C 22 40, 8 34, 10 21"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* Hand-drawn SVG Arrow */}
        {annotation?.arrow && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none z-10"
            style={{
              top: annotation.arrow.top,
              bottom: annotation.arrow.bottom,
              left: annotation.arrow.left,
              right: annotation.arrow.right,
            }}
          >
            <HandDrawnArrow
              direction={annotation.arrow.direction}
              className={annotation.arrow.className}
            />
          </div>
        )}

        {/* Editorial Note Label */}
        {annotation && labelPos && (
          <div
            aria-hidden="true"
            className="absolute z-10 pointer-events-none max-w-[calc(100%-1rem)]"
            style={{
              top: labelPos.top,
              bottom: labelPos.bottom,
              left: labelPos.left,
              right: labelPos.right,
            }}
          >
            <div className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-[#120D08]/90 border border-[#D4AF37]/30 text-[#F5E9D6] text-[11px] sm:text-xs font-normal tracking-normal shadow-sm backdrop-blur-sm whitespace-nowrap">
              <span>{annotation.text}</span>
            </div>
          </div>
        )}
      </div>

      {caption && (
        <figcaption className="text-[11px] sm:text-xs text-[#A1866B] mt-2 px-1 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]/60 shrink-0" />
          <span>{caption}</span>
        </figcaption>
      )}
    </figure>
  )
}
