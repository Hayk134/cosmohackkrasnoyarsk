import React, { useMemo } from 'react';
import { generateQRMatrix } from '../../utils/qrMatrix';

interface QRCodeSVGProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  rawSvgString?: string;
  className?: string;
  includeBorder?: boolean;
}

export const QRCodeSVG: React.FC<QRCodeSVGProps> = ({
  value,
  size = 140,
  fgColor = '#10b981',
  bgColor = 'transparent',
  rawSvgString,
  className = '',
  includeBorder = true,
}) => {
  // If backend provided pre-rendered SVG string, render it directly
  if (rawSvgString && rawSvgString.startsWith('<svg')) {
    return (
      <div
        className={`inline-block ${className}`}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: rawSvgString }}
      />
    );
  }

  // Otherwise compute matrix in pure React/TS
  const matrix = useMemo(() => {
    try {
      return generateQRMatrix(value || 'https://carbon-registry.gov.ru');
    } catch (e) {
      console.error('QR generation error:', e);
      return [];
    }
  }, [value]);

  if (!matrix.length) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500 rounded-lg ${className}`}
        style={{ width: size, height: size }}
      >
        QR Error
      </div>
    );
  }

  const moduleCount = matrix.length;
  const padding = includeBorder ? 2 : 0;
  const viewBoxSize = moduleCount + padding * 2;

  // Build SVG path
  let pathD = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = c + padding;
        const y = r + padding;
        pathD += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={`shape-rendering-crispEdges ${className}`}
      style={{ shapeRendering: 'crispEdges' }}
    >
      {bgColor !== 'transparent' && (
        <rect width={viewBoxSize} height={viewBoxSize} fill={bgColor} />
      )}
      <path d={pathD} fill={fgColor} />
    </svg>
  );
};
