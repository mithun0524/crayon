'use client';

import React, { useEffect, useState } from 'react';

export default function InteractiveBackground() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Use requestAnimationFrame for maximum performance
      requestAnimationFrame(() => {
        setMousePosition({
          x: e.clientX,
          y: e.clientY,
        });
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div 
      className="mouse-spotlight"
      style={{
        '--mouse-x': `${mousePosition.x}px`,
        '--mouse-y': `${mousePosition.y}px`,
      } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}
