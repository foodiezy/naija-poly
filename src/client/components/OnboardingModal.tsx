import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useDialog } from "../hooks/useDialog";
import { GAME_GUIDE } from "../lib/gameGuide";

interface OnboardingModalProps {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  return createPortal(
    <div className="v2-overlay" style={{ zIndex: 10000 }}>
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="How to play Odogwu Empire"
        className="v2-overlay-card"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <header className="v2-overlay-head">
          <h2>How to play</h2>
          <button type="button" className="v2-overlay-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="v2-overlay-body">
          {GAME_GUIDE.map((step) => (
            <div className="v2-rule" key={step.id}>
              <span className="v2-rule-emoji" aria-hidden="true">
                {step.emoji}
              </span>
              <div>
                <b>{step.title}</b>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <footer className="v2-overlay-foot">
          <button type="button" className="v2-btn v2-btn-pri" onClick={onClose}>
            Make we play!
          </button>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
