import { motion } from "framer-motion";

interface OnboardingModalProps {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <motion.div
        className="modal-content"
        style={{
          maxWidth: "600px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-color)",
          padding: "2rem",
          position: "relative",
        }}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <button
          className="modal-close-btn"
          onClick={onClose}
          style={{ position: "absolute", top: "1rem", right: "1rem" }}
          title="Close Tutorial"
        >
          ✕
        </button>

        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontSize: "2rem",
              color: "var(--color-gold)",
              margin: "0 0 0.5rem 0",
              textTransform: "uppercase",
            }}
          >
            Welcome to Odogwu Empire 🏛️
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", margin: 0 }}>
            Buy the land. Bankrupt your friends. Become the Odogwu.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              background: "var(--surface-3)",
              padding: "1rem",
              borderRadius: "8px",
              borderLeft: "4px solid var(--color-property-2)",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#fff", fontSize: "1.1rem" }}>
              🏢 The Map
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                lineHeight: "1.5",
              }}
            >
              Travel across Nigeria buying properties. Complete color sets to build Houses and
              Hotels (so you can charge crazy rent).
            </p>
          </div>

          <div
            style={{
              background: "var(--surface-3)",
              padding: "1rem",
              borderRadius: "8px",
              borderLeft: "4px solid var(--color-gold)",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#fff", fontSize: "1.1rem" }}>
              🎲 Hustle & Chance
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                lineHeight: "1.5",
              }}
            >
              Land on <strong>Hustle Box</strong> or <strong>Chance</strong> to draw a card. You
              might win a jackpot or get arrested by the EFCC.
            </p>
          </div>

          <div
            style={{
              background: "var(--surface-3)",
              padding: "1rem",
              borderRadius: "8px",
              borderLeft: "4px solid var(--color-naira)",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#fff", fontSize: "1.1rem" }}>
              🔌 Utilities & Transport
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                lineHeight: "1.5",
              }}
            >
              <strong>NEPA & NAFDAC:</strong> Utilities charge rent based on your dice roll. <br />
              <strong>Airports:</strong> Rent doubles for each airport owned by the same player.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <button
            className="action-btn action-btn-buy"
            onClick={onClose}
            style={{ padding: "0.8rem 2.5rem", fontSize: "1.1rem" }}
          >
            Let's Play!
          </button>
        </div>
      </motion.div>
    </div>
  );
}
