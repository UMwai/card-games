import type { GameKind } from "../../shared/types";
import { RULES } from "../rules";

export function RulesSheet({ game, onClose }: { game: GameKind; onClose: () => void }) {
  const rules = RULES[game];
  return (
    <div className="modal-wash" role="presentation" onMouseDown={onClose}>
      <article className="rules-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} aria-label="Close rules">
          ×
        </button>
        <p className="eyebrow">How to play</p>
        <h2>{rules.title}</h2>
        <p className="rules-subtitle">{rules.subtitle}</p>
        <div className="rule-grid">
          {rules.sections.map((section, index) => (
            <section key={section.heading}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </div>
            </section>
          ))}
        </div>
        <p className="house-note">
          Card-room customs vary by region. This edition keeps one consistent ruleset so friends and bots always agree.
        </p>
      </article>
    </div>
  );
}
