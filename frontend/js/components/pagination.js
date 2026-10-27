/* ==========================================================================
   Pagination component
   Usage:
     renderPagination(document.getElementById('my-pagination'), currentPage,
                      totalPages, (newPage) => { ...re-render your table... });

   Draws  « Prev  1 … 4 [5] 6 … 20  Next »  into the mount element. It only
   draws the buttons — the PAGE'S script decides which rows belong to which
   page (see Detections) and re-renders when the callback fires. Hides
   itself when there's only one page. Reusable by Violations later.
   ========================================================================== */

/** Which page numbers to show: always first + last, plus one on each side
 *  of the current page; `null` marks a gap that becomes an ellipsis. */
function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1) {
      pages.push(n);
    } else if (pages[pages.length - 1] !== null) {
      pages.push(null);
    }
  }
  return pages;
}

function renderPagination(mount, currentPage, totalPages, onPageChange) {
  if (!mount) return;

  if (totalPages <= 1) {
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }
  mount.hidden = false;

  const numberButtons = getPageNumbers(currentPage, totalPages).map((n) => {
    if (n === null) return '<span class="pagination-gap">&hellip;</span>';
    const active = n === currentPage;
    return `<button type="button" class="pagination-btn${active ? ' is-active' : ''}"
      data-page="${n}" aria-label="Page ${n}" ${active ? 'aria-current="page"' : ''}>${n}</button>`;
  }).join('');

  mount.innerHTML = `
    <button type="button" class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button>
    ${numberButtons}
    <button type="button" class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>
  `;

  mount.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}
