import React from "react";
import VoiceMark from "./VoiceMark";

const BRAND_WORD = "crwbar";
const PRODUCT_WORD = "voice";
const BRAND_NAME = `${BRAND_WORD} ${PRODUCT_WORD}`;

interface CrwbarVoiceLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

const CrwbarVoiceLogo: React.FC<CrwbarVoiceLogoProps> = ({
  width,
  height,
  className = "",
}) => (
  <div
    className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap ${className}`}
    style={{ width, height }}
    role="img"
    aria-label={BRAND_NAME}
  >
    <VoiceMark className="h-[1.35em] w-[1.35em] text-logo-primary" />
    <span
      className="text-[0.96em] font-semibold leading-none tracking-[-0.045em] text-text"
      style={{
        fontFamily: "'Space Grotesk', Inter, ui-sans-serif, sans-serif",
      }}
    >
      {BRAND_WORD}
    </span>
    <span
      className="text-[0.96em] font-semibold leading-none tracking-[-0.045em] text-logo-primary"
      style={{
        fontFamily: "'Space Grotesk', Inter, ui-sans-serif, sans-serif",
      }}
    >
      {PRODUCT_WORD}
    </span>
  </div>
);

export default CrwbarVoiceLogo;
