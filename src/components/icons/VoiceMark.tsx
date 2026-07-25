import React from "react";
import BuiltStateIcon from "./BuiltStateIcon";

interface VoiceMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/** The quiet three-bar mark used at compact sizes inside the product UI. */
const VoiceMark: React.FC<VoiceMarkProps> = ({
  size = 24,
  width,
  height,
  className,
  ...props
}) => (
  <BuiltStateIcon
    state="idle"
    size={size}
    width={width}
    height={height}
    className={className}
    {...props}
  />
);

export default VoiceMark;
