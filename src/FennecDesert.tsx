import Explorer from "./Explorer";
import { buildDesert } from "./scenes/desert";

export default function FennecDesert({
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
      world={buildDesert}
      className={className}
      style={style}
      onExit={onExit}
      title="Le Sahara à hauteur de fennec"
      hint="Flèches : avancer et tourner · ZQSD : se déplacer · Maj : courir · Espace : sauter · C : vue de derrière · E : parler au Touareg"
    />
  );
}
