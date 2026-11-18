import React, { useState } from 'react';
import logoImg from '../../assets/logo.png';

interface BrandLoaderProps {
  fullScreen?: boolean;
  size?: number;
  className?: string;
}

/**
 * Circular Jaystarbliss brand logo gently breathing in and out, surrounded by a
 * slim multi-color brand gradient ring whose rotation alternates smoothly between
 * very fast sprints and slow calm glides every 1–3 seconds.
 */
export const BrandLoader: React.FC<BrandLoaderProps> = ({
  fullScreen = false,
  size = 86,
  className = '',
}) => {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = [logoImg || '/logo.png', '/logo.png', '/favicon.png'];
  const activeSrc = sources[Math.min(srcIndex, sources.length - 1)];

  const ringSize = size;
  const innerSize = Math.max(44, size - 12);

  return (
    <div
      role="status"
      aria-label="Loading"
      aria-live="polite"
      className={`${
        fullScreen ? 'min-h-screen bg-[#F8FAFC] dark:bg-[#0D0F17]' : 'min-h-[60vh]'
      } w-full flex items-center justify-center p-8 select-none ${className}`}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: ringSize, height: ringSize }}
      >
        {/* Soft outer ambient glow synced with breathing rhythm */}
        <span
          aria-hidden="true"
          className="jb-loader-halo absolute inset-[-4px] rounded-full pointer-events-none"
        />

        {/* Slim gradient ring rotating fast & slow alternating every ~1.5s */}
        <span
          aria-hidden="true"
          className="jb-loader-ring absolute inset-0 rounded-full pointer-events-none"
        />

        {/* Circular breathing brand logo */}
        <div
          className="jb-loader-logo relative rounded-full overflow-hidden flex items-center justify-center bg-[#0B1130] shadow-lg"
          style={{ width: innerSize, height: innerSize }}
        >
          <img
            src={activeSrc}
            alt="Jaystarbliss Studios"
            className="w-full h-full object-cover rounded-full select-none"
            onError={() => {
              if (srcIndex < sources.length - 1) {
                setSrcIndex((prev) => prev + 1);
              }
            }}
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
};

export default BrandLoader;
