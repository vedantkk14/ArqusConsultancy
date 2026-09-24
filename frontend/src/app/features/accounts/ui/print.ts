import { DestroyRef } from '@angular/core';

/** Body class added while a printable document page is open. Removed again when the page is destroyed. */
export const PRINT_CLASS = 'acc-print';

/**
 * Print CSS for statements and receipts, scoped by the body class above so it never touches other pages.
 * Components put it in `styles` with `ViewEncapsulation.None`. It hides the sidebar, top bar, tab bar and
 * anything marked `.no-print`, and lets the document use the whole sheet.
 */
export const PRINT_CSS = `
@media print {
  body.${PRINT_CLASS} { background: #fff !important; }
  body.${PRINT_CLASS} #app-sidebar,
  body.${PRINT_CLASS} app-topbar,
  body.${PRINT_CLASS} app-tabbar,
  body.${PRINT_CLASS} .cdk-overlay-container,
  body.${PRINT_CLASS} .no-print { display: none !important; }
  body.${PRINT_CLASS} .main { margin-left: 0 !important; }
  body.${PRINT_CLASS} .content { max-width: none !important; padding: 0 !important; }
  body.${PRINT_CLASS} .print-doc { border: 0 !important; box-shadow: none !important; background: #fff !important; }
}
`;

/** Add the print class now and remove it when the component goes away. */
export function enablePrintMode(destroyRef: DestroyRef): void {
  document.body.classList.add(PRINT_CLASS);
  destroyRef.onDestroy(() => document.body.classList.remove(PRINT_CLASS));
}
