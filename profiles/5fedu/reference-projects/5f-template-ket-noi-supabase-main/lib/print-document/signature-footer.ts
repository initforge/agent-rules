/** Standard 4-column signature footer for A4 documents. */

export interface SignatureFooterLabels {
  preparer: string;
  reviewer: string;
  related: string;
  approver: string;
  hint: string;
}

const SIGN_BOX_STYLE =
  'flex:1;min-width:0;text-align:center;font-size:9pt;line-height:1.45';
const SIGN_TITLE_STYLE = 'font-weight:700;margin:0;text-transform:uppercase';
const SIGN_HINT_STYLE = 'font-size:8pt;color:#555;margin:2px 0 0 0';
const SIGN_SPACE_STYLE = 'height:50mm';

function signBoxHtml(title: string, hint: string): string {
  return `<div class="epdoc-sign-box" style="${SIGN_BOX_STYLE}">
  <p class="epdoc-sign-box-title" style="${SIGN_TITLE_STYLE}">${title}</p>
  <p class="epdoc-sign-box-hint" style="${SIGN_HINT_STYLE}">${hint}</p>
  <div class="epdoc-sign-space" style="${SIGN_SPACE_STYLE}" aria-hidden="true"></div>
</div>`;
}

/** Inline HTML for Word / static export */
export function buildSignatureFooterHTML(labels: SignatureFooterLabels): string {
  return `<div class="epdoc-sign-footer" style="display:flex;gap:12px;margin-top:24pt;page-break-inside:avoid">
  ${signBoxHtml(labels.preparer, labels.hint)}
  ${signBoxHtml(labels.reviewer, labels.hint)}
  ${signBoxHtml(labels.related, labels.hint)}
  ${signBoxHtml(labels.approver, labels.hint)}
</div>`;
}

/** React-friendly label list for preview component */
export function getSignatureFooterRoles(
  labels: SignatureFooterLabels
): { key: string; title: string; hint: string }[] {
  return [
    { key: 'preparer', title: labels.preparer, hint: labels.hint },
    { key: 'reviewer', title: labels.reviewer, hint: labels.hint },
    { key: 'related', title: labels.related, hint: labels.hint },
    { key: 'approver', title: labels.approver, hint: labels.hint },
  ];
}
