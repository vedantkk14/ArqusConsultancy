import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { indian, ordinalDate, quantityText } from '../data/invoice-calc';
import { Invoice } from '../data/invoice.models';

interface TotalRow {
  label: string;
  value: string;
  bold?: boolean;
}

/**
 * The invoice as a printed page: the same layout, numbers and stamp as the PDF the client receives,
 * drawn in HTML so it is always crisp, sized to the screen, and free of any browser PDF viewer frame.
 * Everything is in `em`, and the font scales with the page width, so it is a faithful replica at any size.
 */
@Component({
  selector: 'app-invoice-paper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .stage {
      padding: clamp(10px, 3vw, 32px); border-radius: var(--radius-card);
      background: linear-gradient(180deg, #eef2f7, #e7ecf3);
    }
    .sheet { container-type: inline-size; width: 100%; max-width: 860px; margin: 0 auto; }
    .paper {
      box-sizing: border-box; padding: 4.6em 4.5em 4em; background: #fff; color: #000; border-radius: 0.4em;
      font: 1.479cqw/1.4 'Helvetica Neue', Helvetica, Arial, sans-serif;
      box-shadow: 0 1px 2px rgb(15 23 42 / 0.1), 0 10px 28px rgb(15 23 42 / 0.16);
    }
    .head { display: flex; justify-content: space-between; gap: 2em; }
    .logo { display: block; width: 16.8em; height: auto; align-self: flex-start; }
    .company { text-align: right; font-size: 0.98em; line-height: 1.32; }
    .company b { font-size: 1.1em; }
    .company a { color: #0b5cd5; text-decoration: underline; }
    .rule { height: 0; margin: 0.7em 0; border-top: 0.09em solid #000; }
    .title { margin: 0; text-align: center; font-size: 1.6em; font-weight: 700; line-height: 1.4; }
    .rule.first { margin-top: 3.4em; }
    .meta { margin: 1.6em 0 1.2em; text-align: right; font-size: 1.02em; font-style: italic; line-height: 1.45; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; border: 0.09em solid #000; }
    .party { min-height: 12em; padding: 0.7em 0.7em 2em; }
    .party + .party { border-left: 0.09em solid #000; }
    .party .lbl { font-weight: 700; font-style: italic; }
    .party .nm { font-weight: 700; }
    .party p { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
    table { width: 100%; margin-top: 2.7em; border-collapse: collapse; table-layout: fixed; border: 0.11em solid #000; }
    th, td { padding: 0.45em 0.55em; vertical-align: top; }
    th { background: #f1f3f6; text-align: center; font-weight: 700; border-bottom: 0.11em solid #000; line-height: 1.3; }
    th + th, td + td { border-left: 0.09em solid #000; }
    td.c { text-align: center; font-weight: 700; }
    td.r { text-align: right; }
    td.p { font-weight: 700; white-space: pre-line; overflow-wrap: anywhere; }
    tr.fill td { height: var(--gap, 3.2em); padding: 0; }
    tr.tot td { border-top: 0.09em solid #000; vertical-align: middle; }
    tr.tot td.lbl { text-align: right; border-left: 0; }
    tr.tot.grand td { background: #f1f3f6; font-weight: 700; font-size: 1.04em; }
    tr.tot.first td { border-top-width: 0.11em; }
    .words { margin: 0.6em 0 0; font: italic 700 1.14em/1.4 'Times New Roman', Times, serif; }
    .cert { margin: 2.4em 0 0 2.6em; font: italic 700 1.2em/1.45 'Times New Roman', Times, serif; }
    .stamp { display: block; width: 18.7em; height: auto; margin: 1.8em 0 0 auto; }
  `,
  template: `
    <div class="stage">
      <div class="sheet">
        <article class="paper" [attr.aria-label]="'Invoice ' + invoice().invoice_no">
          <header class="head">
            <img class="logo" src="invoice/arqus-logo.png" alt="ARQUS Sports Consultancy" />
            <div class="company">
              <b>{{ invoice().company.name }}</b><br />
              @for (line of invoice().company.address_lines; track line) {
                {{ line }}<br />
              }
              Ph no - {{ invoice().company.phone }}<br />
              <a [href]="'mailto:' + invoice().company.email">{{ invoice().company.email }}</a><br />
              <a [href]="'https://' + invoice().company.website" target="_blank" rel="noopener">{{ invoice().company.website }}</a><br />
              PAN:{{ invoice().company.pan }} GSTIN:{{ invoice().company.gstin }}
            </div>
          </header>
          <div class="rule first"></div>
          <h2 class="title">TAX INVOICE</h2>
          <div class="rule"></div>

          <p class="meta">Date: {{ date() }}<br />Invoice No: {{ invoice().invoice_no }}</p>

          <div class="parties">
            <div class="party">
              <p class="lbl">BILL TO/SHIP TO:</p>
              <p class="nm">{{ invoice().client_name }}</p>
              @if (invoice().client_address) { <p>{{ invoice().client_address }}</p> }
              @if (invoice().client_gstin) { <p>GSTIN:{{ invoice().client_gstin }}</p> }
              @if (invoice().client_phone) { <p>Ph: {{ invoice().client_phone }}</p> }
            </div>
            <div class="party">
              <p class="lbl">BILL FROM:</p>
              <p class="nm">{{ invoice().company.name }}</p>
              <p>{{ invoice().company.email }}</p>
              <p>{{ invoice().company.website }}</p>
              <p>PAN: {{ invoice().company.pan }}</p>
              <p>GSTIN: {{ invoice().company.gstin }}</p>
            </div>
          </div>

          <table>
            <colgroup>
              <col style="width: 7.1%" /><col style="width: 38.5%" /><col style="width: 12.1%" />
              <col style="width: 12.1%" /><col style="width: 10.4%" /><col style="width: 7.7%" /><col style="width: 12.1%" />
            </colgroup>
            <thead>
              <tr><th>Sr<br />no</th><th>Particulars</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Unit</th><th>Total</th></tr>
            </thead>
            <tbody>
              @for (item of invoice().items; track $index; let i = $index) {
                <tr>
                  <td class="c" style="font-weight: 400">{{ pad(i + 1) }}</td>
                  <td class="p">{{ item.particulars }}</td>
                  <td class="c">{{ item.hsn }}</td>
                  <td class="c">{{ qty(item.quantity) }}</td>
                  <td class="c" style="font-weight: 400">{{ money(item.rate) }}</td>
                  <td class="c" style="font-weight: 400">{{ item.unit }}</td>
                  <td class="r">{{ money(item.amount) }}</td>
                </tr>
              }
              <tr class="fill" [style.--gap.em]="gap()"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              @for (row of totals(); track row.label; let first = $first; let last = $last) {
                <tr class="tot" [class.grand]="last" [class.first]="first">
                  <td class="lbl" colspan="6">{{ row.label }}</td>
                  <td class="r" [style.font-weight]="row.bold ? 700 : 400">{{ row.value }}</td>
                </tr>
              }
            </tbody>
          </table>

          <p class="words">IN WORDS: {{ invoice().amount_in_words }}</p>
          <p class="cert">
            Certified that the particulars given above are true and correct. For - "{{ invoice().company.short_name }}."
            (Authorized Signatory)
          </p>
          <img class="stamp" src="invoice/arqus-stamp.png" alt="Authorized signature and company stamp" />
        </article>
      </div>
    </div>
  `,
})
export class InvoicePaper {
  readonly invoice = input.required<Invoice>();

  protected readonly date = computed(() => ordinalDate(this.invoice().invoice_date));

  /**
   * Space under the last item, as in the PDF: the items area is at least ~12em tall, and there is
   * always ~3.2em of room before the totals. Each row is ~0.9em of padding plus 1.4em per text line.
   */
  protected readonly gap = computed(() => {
    const used = this.invoice().items.reduce(
      (sum, item) => sum + 0.9 + 1.4 * Math.max(1, (item.particulars || '').split(/\r?\n/).length),
      0,
    );
    return Math.max(3.2, 12 - used);
  });

  protected readonly totals = computed<TotalRow[]>(() => {
    const inv = this.invoice();
    const tax = Number(inv.tax_amount);
    const pct = inv.gst_percent ? Number(inv.gst_percent) : 0;
    const rows: TotalRow[] = [];
    if (tax || inv.items.length > 1) {
      rows.push({ label: 'Sub Total', value: indian(inv.subtotal) });
    }
    if (tax && pct) {
      if (inv.tax_type === 'CGST_SGST') {
        rows.push({ label: `CGST @ ${pct / 2}%`, value: indian(inv.figures.cgst) });
        rows.push({ label: `SGST @ ${pct / 2}%`, value: indian(inv.figures.sgst) });
      } else {
        rows.push({ label: `IGST @ ${pct}%`, value: indian(tax) });
      }
    }
    if (Number(inv.round_off)) {
      rows.push({ label: 'Round off', value: indian(inv.round_off) });
    }
    rows.push({ label: 'TOTAL', value: indian(inv.total), bold: true });
    return rows;
  });

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected money(value: string | undefined): string {
    return indian(value);
  }

  protected qty(value: string): string {
    return quantityText(value);
  }
}
