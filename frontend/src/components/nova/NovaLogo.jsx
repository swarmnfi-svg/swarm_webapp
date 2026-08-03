import { useEffect, useState } from 'react';

const ASSET_V = '2';

/**
 * NOVA brand mark (transparent orb). When `thinking`, plays the slowed GIF.
 */
export default function NovaLogo({
  size = 40,
  thinking = false,
  variant = 'icon',
  className = '',
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const idleSrc = variant === 'logo' ? `/nova-logo.png?v=${ASSET_V}` : `/nova-icon.png?v=${ASSET_V}`;
  const thinkingSrc = `/nova-thinking.gif?v=${ASSET_V}`;
  const stillSrc = `/nova-thinking-still.png?v=${ASSET_V}`;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const src = thinking && !reduceMotion ? thinkingSrc : thinking ? stillSrc : idleSrc;

  return (
    <span
      className={`nova-logo relative inline-flex shrink-0 items-center justify-center bg-transparent ${
        thinking && !reduceMotion ? 'nova-logo--thinking' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img
        key={src}
        src={src}
        alt=""
        width={size}
        height={size}
        className="nova-logo-orb pointer-events-none h-full w-full object-contain"
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
