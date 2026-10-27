/* ==========================================================================
   Modal component
   Shared by any page that needs a details popup (Detections now; Violations
   will likely reuse this in Phase 5). Creates a single overlay element in
   the DOM on first use — pages don't need their own modal markup, just
   call openModal(htmlString) / closeModal().
   ========================================================================== */

function ensureModalOverlay() {
  let overlay = document.getElementById('app-modal-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'app-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal" id="app-modal-content"></div>`;

  // Click outside the modal (on the dark backdrop) closes it.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });

  document.body.appendChild(overlay);
  return overlay;
}

function openModal(contentHtml) {
  const overlay = ensureModalOverlay();
  document.getElementById('app-modal-content').innerHTML = contentHtml;
  overlay.hidden = false;
}

function closeModal() {
  const overlay = document.getElementById('app-modal-overlay');
  if (overlay) overlay.hidden = true;
}

// Escape key closes the modal from anywhere on the page.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});
