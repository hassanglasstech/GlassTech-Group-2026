import React from 'react';

interface WindowSVGProps {
  typeId: string;
  width?: number;
  height?: number;
  color?: string;
}

const WindowSVG: React.FC<WindowSVGProps> = ({ typeId, width = 140, height = 110, color = '#2563eb' }) => {
  const f = { x: 8, y: 8, w: width - 16, h: height - 16 };
  const gray = '#6b7280';
  const blue = color;

  const Frame = () => (
    <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#dbeafe" stroke={gray} strokeWidth="3" rx="1" />
  );

  const Diag = ({ x, y, bw, bh, dir = 'left' }: { x: number; y: number; bw: number; bh: number; dir?: 'left' | 'right' }) =>
    dir === 'left' ? (
      <>
        <line x1={x} y1={y} x2={x + bw} y2={y + bh / 2} stroke={blue} strokeWidth="1.2" />
        <line x1={x} y1={y + bh} x2={x + bw} y2={y + bh / 2} stroke={blue} strokeWidth="1.2" />
      </>
    ) : (
      <>
        <line x1={x + bw} y1={y} x2={x} y2={y + bh / 2} stroke={blue} strokeWidth="1.2" />
        <line x1={x + bw} y1={y + bh} x2={x} y2={y + bh / 2} stroke={blue} strokeWidth="1.2" />
      </>
    );

  const renderBody = () => {
    switch (typeId) {
      case 'openable_1': {
        const mh = f.h * 0.72;
        return (
          <>
            <Frame />
            <rect x={f.x + 5} y={f.y + 5} width={f.w - 10} height={mh - 5} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.3" />
            <Diag x={f.x + 7} y={f.y + 7} bw={f.w - 14} bh={mh - 10} />
            <rect x={f.x + 5} y={f.y + mh} width={f.w - 10} height={f.h - mh - 5} fill="rgba(255,255,255,.3)" stroke={gray} strokeWidth="1.3" />
          </>
        );
      }
      case 'openable_2': {
        const mid = f.w / 2;
        const mh = f.h * 0.72;
        return (
          <>
            <Frame />
            <rect x={f.x + 4} y={f.y + 4} width={mid - 4} height={mh - 4} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.3" />
            <Diag x={f.x + 6} y={f.y + 6} bw={mid - 8} bh={mh - 8} dir="left" />
            <rect x={f.x + mid} y={f.y + 4} width={mid - 4} height={mh - 4} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.3" />
            <Diag x={f.x + mid + 2} y={f.y + 6} bw={mid - 8} bh={mh - 8} dir="right" />
            <rect x={f.x + 4} y={f.y + mh} width={f.w - 8} height={f.h - mh - 4} fill="rgba(255,255,255,.3)" stroke={gray} strokeWidth="1.3" />
          </>
        );
      }
      case 'fixed_no_div':
        return (
          <>
            <Frame />
            <rect x={f.x + 5} y={f.y + 5} width={f.w - 10} height={f.h - 10} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.3" />
          </>
        );
      case 'fixed_div': {
        const mv = f.w * 0.5;
        const mh2 = f.h * 0.6;
        return (
          <>
            <Frame />
            <line x1={f.x + mv} y1={f.y} x2={f.x + mv} y2={f.y + f.h} stroke={gray} strokeWidth="2" />
            <line x1={f.x} y1={f.y + mh2} x2={f.x + f.w} y2={f.y + mh2} stroke={gray} strokeWidth="2" />
          </>
        );
      }
      case 'top_hung': {
        const mh = f.h * 0.7;
        return (
          <>
            <Frame />
            <rect x={f.x + 5} y={f.y + 5} width={f.w - 10} height={mh - 5} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.3" />
            <line x1={f.x + f.w * 0.3} y1={f.y + 7} x2={f.x + f.w / 2} y2={f.y + mh} stroke={blue} strokeWidth="1.3" />
            <line x1={f.x + f.w * 0.7} y1={f.y + 7} x2={f.x + f.w / 2} y2={f.y + mh} stroke={blue} strokeWidth="1.3" />
            <rect x={f.x + 5} y={f.y + mh} width={f.w - 10} height={f.h - mh - 5} fill="rgba(255,255,255,.3)" stroke={gray} strokeWidth="1.3" />
          </>
        );
      }
      case 'sliding_1': {
        return (
          <>
            <Frame />
            <rect x={f.x + 2} y={f.y + 3} width={f.w - 2} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            <line x1={f.x + f.w * 0.1} y1={f.y + f.h / 2} x2={f.x + f.w * 0.9} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
          </>
        );
      }
      case 'sliding_2': {
        const sw = f.w / 2;
        return (
          <>
            <Frame />
            <rect x={f.x + 2} y={f.y + 3} width={sw - 2} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            <rect x={f.x + sw} y={f.y + 3} width={sw - 2} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            <line x1={f.x + sw * 0.15} y1={f.y + f.h / 2} x2={f.x + sw * 0.85} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <line x1={f.x + sw * 1.15} y1={f.y + f.h / 2} x2={f.x + sw * 1.85} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
          </>
        );
      }
      case 'sliding_4': {
        const sw = f.w / 4;
        return (
          <>
            <Frame />
            {[0, 1, 2, 3].map(i => (
              <rect key={i} x={f.x + i * sw + 2} y={f.y + 3} width={sw - 2} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            ))}
            <line x1={f.x + sw * 0.15} y1={f.y + f.h / 2} x2={f.x + sw * 0.85} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <line x1={f.x + sw * 1.15} y1={f.y + f.h / 2} x2={f.x + sw * 1.85} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
          </>
        );
      }
      case 'lift_slide': {
        return (
          <>
            <Frame />
            <rect x={f.x + 3} y={f.y + 3} width={f.w / 2 - 3} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.4" />
            <rect x={f.x + f.w / 2} y={f.y + 3} width={f.w / 2 - 3} height={f.h - 6} fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.4" />
            <line x1={f.x + f.w * 0.08} y1={f.y + f.h / 2} x2={f.x + f.w * 0.42} y2={f.y + f.h / 2} stroke={blue} strokeWidth="2" markerEnd="url(#ra)" />
            <text x={f.x + f.w / 2} y={f.y + f.h - 5} textAnchor="middle" fontSize="7" fill="#6b7280" fontWeight="600">L&amp;S</text>
          </>
        );
      }
      case 'casement_1': {
        return (
          <>
            <Frame />
            <rect x={f.x + 5} y={f.y + 5} width={f.w - 10} height={f.h - 10} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="2" />
            <line x1={f.x + 5} y1={f.y + 5} x2={f.x + f.w - 5} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
            <line x1={f.x + 5} y1={f.y + f.h - 5} x2={f.x + f.w - 5} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
            <rect x={f.x + f.w - 13} y={f.y + f.h / 2 - 7} width={4} height={14} fill={gray} rx="1" />
          </>
        );
      }
      case 'casement_2': {
        const mid = f.w / 2;
        return (
          <>
            <Frame />
            <rect x={f.x + 4} y={f.y + 4} width={mid - 4} height={f.h - 8} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.4" />
            <line x1={f.x + 4} y1={f.y + 4} x2={f.x + mid} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
            <line x1={f.x + 4} y1={f.y + f.h - 4} x2={f.x + mid} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
            <rect x={f.x + mid + 4} y={f.y + 4} width={mid - 8} height={f.h - 8} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.4" />
            <line x1={f.x + f.w - 4} y1={f.y + 4} x2={f.x + mid + 4} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
            <line x1={f.x + f.w - 4} y1={f.y + f.h - 4} x2={f.x + mid + 4} y2={f.y + f.h / 2} stroke={blue} strokeWidth="1.3" />
          </>
        );
      }
      // Folding door — 4 sash accordion lines
      case 'folding_4': {
        const sw = f.w / 4;
        return (
          <>
            <Frame />
            {[0,1,2,3].map(i => (
              <rect key={i} x={f.x + i * sw + 2} y={f.y + 4} width={sw - 2} height={f.h - 8}
                fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            ))}
            {/* Accordion fold lines */}
            {[1,2,3].map(i => (
              <line key={i} x1={f.x + i * sw} y1={f.y} x2={f.x + i * sw} y2={f.y + f.h}
                stroke={blue} strokeWidth="1.5" strokeDasharray="3,2" />
            ))}
            <text x={f.x + f.w/2} y={f.y + f.h - 5} textAnchor="middle" fontSize="7" fill={blue} fontWeight="700">FOLD</text>
          </>
        );
      }
      // Hanging / barn door — top rail visible
      case 'hanging': {
        return (
          <>
            <Frame />
            {/* Top rail */}
            <rect x={f.x} y={f.y} width={f.w} height={6} fill={gray} rx="1" />
            {/* Door panel */}
            <rect x={f.x + 4} y={f.y + 8} width={f.w - 8} height={f.h - 12} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.5" />
            {/* Roller wheels */}
            <circle cx={f.x + 14} cy={f.y + 3} r={4} fill="#fff" stroke={gray} strokeWidth="1.2" />
            <circle cx={f.x + f.w - 14} cy={f.y + 3} r={4} fill="#fff" stroke={gray} strokeWidth="1.2" />
            {/* Arrow */}
            <line x1={f.x + f.w * 0.2} y1={f.y + f.h/2} x2={f.x + f.w * 0.8} y2={f.y + f.h/2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <text x={f.x + f.w/2} y={f.y + f.h - 5} textAnchor="middle" fontSize="7" fill={blue} fontWeight="700">HANG</text>
          </>
        );
      }
      // Pocket / concealed sliding
      case 'pocket': {
        return (
          <>
            <Frame />
            <rect x={f.x + 4} y={f.y + 4} width={f.w/2 - 4} height={f.h - 8} fill="rgba(255,255,255,.55)" stroke={gray} strokeWidth="1.5" />
            {/* Wall pocket indicator - dashed right half */}
            <rect x={f.x + f.w/2} y={f.y + 4} width={f.w/2 - 4} height={f.h - 8}
              fill="rgba(200,200,200,.2)" stroke={gray} strokeWidth="1" strokeDasharray="4,3" />
            <line x1={f.x + f.w * 0.1} y1={f.y + f.h/2} x2={f.x + f.w * 0.45} y2={f.y + f.h/2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <text x={f.x + f.w * 0.75} y={f.y + f.h/2} textAnchor="middle" fontSize="7" fill="#94a3b8" fontStyle="italic">wall</text>
          </>
        );
      }
      // MS Door (steel frame, diagonal cross)
      case 'ms_door': {
        return (
          <>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#e2e8f0" stroke="#475569" strokeWidth="3" rx="1" />
            <rect x={f.x + 6} y={f.y + 6} width={f.w - 12} height={f.h - 12} fill="rgba(200,200,200,.4)" stroke="#475569" strokeWidth="1.5" />
            {/* X bracing = MS frame indicator */}
            <line x1={f.x + 8} y1={f.y + 8} x2={f.x + f.w - 8} y2={f.y + f.h - 8} stroke="#475569" strokeWidth="1.2" />
            <line x1={f.x + f.w - 8} y1={f.y + 8} x2={f.x + 8} y2={f.y + f.h - 8} stroke="#475569" strokeWidth="1.2" />
            <text x={f.x + f.w/2} y={f.y + f.h/2 + 3} textAnchor="middle" fontSize="8" fill="#475569" fontWeight="800">MS</text>
          </>
        );
      }
      // UPVC Solid Door
      case 'upvc_solid': {
        return (
          <>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#fef9ee" stroke="#78716c" strokeWidth="3" rx="2" />
            <rect x={f.x + 6} y={f.y + 6} width={f.w - 12} height={(f.h - 12) * 0.45} fill="rgba(180,150,80,.15)" stroke="#a18952" strokeWidth="1" rx="2" />
            <rect x={f.x + 6} y={f.y + 8 + (f.h - 12) * 0.45} width={f.w - 12} height={(f.h - 12) * 0.45} fill="rgba(180,150,80,.15)" stroke="#a18952" strokeWidth="1" rx="2" />
            {/* Wood grain lines */}
            {[0.3,0.5,0.7].map(r => (
              <line key={r} x1={f.x + 8} y1={f.y + f.h * r} x2={f.x + f.w - 8} y2={f.y + f.h * r} stroke="#d4a96a" strokeWidth="0.6" />
            ))}
            <text x={f.x + f.w/2} y={f.y + f.h - 5} textAnchor="middle" fontSize="6.5" fill="#78716c" fontWeight="700">UPVC</text>
          </>
        );
      }
      // Synchronized sliding (3+3 system)
      case 'sync_slide': {
        const sw = f.w / 3;
        return (
          <>
            <Frame />
            {[0,1,2].map(i => (
              <rect key={i} x={f.x + i * sw + 1} y={f.y + 3} width={sw - 1} height={f.h - 6}
                fill="rgba(255,255,255,.45)" stroke={gray} strokeWidth="1.2" />
            ))}
            <line x1={f.x + sw*0.1} y1={f.y + f.h/2} x2={f.x + sw*0.9} y2={f.y + f.h/2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <line x1={f.x + sw*1.1} y1={f.y + f.h/2} x2={f.x + sw*1.9} y2={f.y + f.h/2} stroke={blue} strokeWidth="1.5" markerEnd="url(#ra)" />
            <text x={f.x + f.w/2} y={f.y + f.h - 5} textAnchor="middle" fontSize="6.5" fill={blue} fontWeight="700">SYNC</text>
          </>
        );
      }
      default:
        return <Frame />;
    }
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="ra" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L5,2.5z" fill={blue} />
        </marker>
      </defs>
      {renderBody()}
    </svg>
  );
};

export default WindowSVG;
