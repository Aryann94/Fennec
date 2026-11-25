import Explorer from "./Explorer";
import { buildCoast } from "./scenes/coast";

export default function Littoral({
  className,
  style,
  onExit,
}: {
  className?: string;
  style?: React.CSSProperties;
  onExit?: () => void;
}) {
  return (
    <Explorer
      world={buildCoast}
      className={className}
      style={style}
      onExit={onExit}
      title="Le littoral à hauteur de fennec"
      hint="Flèches / ZQSD : se déplacer · Maj : courir · Espace : sauter · Le stade est droit devant"
    />
  );
}
