import React from "react";

export type BuiltState = "idle" | "recording" | "transcribing" | "done";

interface BuiltStateIconProps extends React.SVGProps<SVGSVGElement> {
  state: BuiltState;
  size?: number | string;
}

/** Clean state-first micro icon assembled from bold, rounded strokes. */
const BuiltStateIcon: React.FC<BuiltStateIconProps> = ({
  state,
  size = 22,
  width,
  height,
  className,
  ...props
}) => (
  <svg
    viewBox="80 100 864 864"
    width={width ?? size}
    height={height ?? size}
    className={className}
    aria-hidden="true"
    {...props}
  >
    {state === "idle" && (
      <g
        className="built-bars built-bars-idle"
        fill="none"
        stroke="currentColor"
        strokeWidth="126"
        strokeLinecap="round"
      >
        <path className="built-bar built-bar-left" d="M260 360V664" />
        <path className="built-bar built-bar-center" d="M512 360V664" />
        <path className="built-bar built-bar-right" d="M764 360V664" />
      </g>
    )}
    {state === "recording" && (
      <g
        className="built-bars built-bars-recording"
        fill="none"
        stroke="currentColor"
        strokeWidth="126"
        strokeLinecap="round"
      >
        <path className="built-bar built-bar-left" d="M260 410V614" />
        <path className="built-bar built-bar-center" d="M512 278V746" />
        <path className="built-bar built-bar-right" d="M764 370V654" />
      </g>
    )}
    {state === "transcribing" && (
      <g
        className="built-lines"
        fill="none"
        stroke="currentColor"
        strokeWidth="118"
        strokeLinecap="round"
      >
        <path className="built-line built-line-top" d="M170 324H854" />
        <path className="built-line built-line-middle" d="M220 512H804" />
        <path className="built-line built-line-bottom" d="M270 700H754" />
      </g>
    )}
    {state === "done" && (
      <path
        d="M150 500L390 718L864 250"
        fill="none"
        stroke="currentColor"
        strokeWidth="132"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

export default BuiltStateIcon;
