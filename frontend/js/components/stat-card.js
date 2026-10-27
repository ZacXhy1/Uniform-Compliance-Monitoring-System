/* ==========================================================================
   Stat card component
   Owned by: Paul (Dashboard & Reports phase)
   Purpose: render a single stat-card.stat-card block (see components.css)
   given a { value, label } shape, with an optional color "tone" for values
   that should stand out (e.g. green for compliant, red for violations).
   Built out in Phase 2 for Dashboard; Reports (Phase 6) can reuse this too.
   ========================================================================== */

/**
 * @param {string|number} value
 * @param {string} label
 * @param {'success'|'danger'|'primary'} [tone] - optional color accent for
 *   the value. Omit for the default neutral dark-gray value color.
 */
function renderStatCard(value, label, tone) {
  const toneClass = tone ? ` stat-card-value--${tone}` : '';
  return `
    <div class="card stat-card">
      <div class="stat-card-value${toneClass}">${value}</div>
      <div class="stat-card-label">${label}</div>
    </div>
  `;
}
