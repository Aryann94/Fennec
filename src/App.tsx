import { useCallback, useState } from "react";
import FennecDesert from "./FennecDesert";
import Littoral from "./Littoral";
import Menu, { type PlateauId } from "./Menu";

export default function App() {
  const [plateau, setPlateau] = useState<PlateauId | null>(null);
  const backToMenu = useCallback(() => setPlateau(null), []);

  if (!plateau) return <Menu onSelect={setPlateau} />;

  return (
    <div style={{ position: "relative", height: "100vh" }}>
      {plateau === "desert" ? (
        <FennecDesert style={{ height: "100%" }} onExit={backToMenu} />
      ) : (
        <Littoral style={{ height: "100%" }} onExit={backToMenu} />
      )}
      <button
        type="button"
        onClick={backToMenu}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(251, 230, 207, 0.35)",
          background: "rgba(12, 16, 36, 0.55)",
          color: "#fbe6cf",
          font: "500 14px/1.2 system-ui, sans-serif",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ← Plateaux
      </button>
    </div>
  );
}
