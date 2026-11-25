export type PlateauId = "desert" | "coast";

type Plateau = {
  id: PlateauId;
  name: string;
  tagline: string;
  description: string;
  thumb: string;
};

const PLATEAUX: Plateau[] = [
  {
    id: "desert",
    name: "Désert",
    tagline: "Sahara au crépuscule",
    description:
      "Des dunes de sable, des rochers, des herbes sèches et un ciel étoilé sous un soleil couchant.",
    thumb: "linear-gradient(180deg, #141a3c 0%, #4a3358 36%, #c96f48 68%, #a85f38 100%)",
  },
  {
    id: "coast",
    name: "Littoral",
    tagline: "Côte herbeuse et stade",
    description:
      "La mer, une plage de sable, des prairies verdoyantes et un stade de football à explorer.",
    thumb:
      "linear-gradient(180deg, #2c6fa8 0%, #8fbcd8 30%, #2c6f8a 44%, #a7c98a 50%, #4a7a3c 100%)",
  },
];

export default function Menu({ onSelect }: { onSelect: (id: PlateauId) => void }) {
  return (
    <div className="menu-screen">
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4.4vw, 46px)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          Balade à hauteur de fennec
        </h1>
        <p style={{ margin: "12px 0 0", opacity: 0.68, fontSize: 16 }}>
          Choisis un plateau pour commencer l&apos;exploration.
        </p>
      </header>

      <div className="plateau-grid">
        {PLATEAUX.map((p) => (
          <button
            key={p.id}
            type="button"
            className="plateau-card"
            onClick={() => onSelect(p.id)}
          >
            <span className="plateau-thumb" style={{ background: p.thumb }}>
              <span className="plateau-thumb-name">{p.tagline}</span>
            </span>
            <span className="plateau-body">
              <strong>{p.name}</strong>
              <span className="plateau-desc">{p.description}</span>
              <span className="plateau-cta">Explorer →</span>
            </span>
          </button>
        ))}
      </div>

      <p style={{ margin: 0, opacity: 0.45, fontSize: 14 }}>
        Flèches ou ZQSD pour marcher · Maj pour courir · Espace pour sauter
      </p>
    </div>
  );
}
